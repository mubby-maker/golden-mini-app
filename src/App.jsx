import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const PAYMENT_WALLET = '0xF8354B188fAC6B6341273641de4F014921F82032'
const OWNER_TELEGRAM_ID = '9278551040'

const plans = {
  starter: { name: 'Starter', price: 1, daily: 1, days: 30 },
  premium: { name: 'Premium', price: 5, daily: 7, days: 15 }
}

export default function App() {
  const [page, setPage] = useState('home')
  const [plan, setPlan] = useState('starter')
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    referralCode: ''
  })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [transactionHash, setTransactionHash] = useState('')
  const [members, setMembers] = useState([])
  const [deposits, setDeposits] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedPlan = plans[plan]

  useEffect(() => {
    window.Telegram?.WebApp?.ready()
    window.Telegram?.WebApp?.expand()

    checkSession()
  }, [])

  async function checkSession() {
    const { data } = await supabase.auth.getSession()

    if (data.session) {
      await loadProfile()
    }
  }

  async function loadProfile() {
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      setPage('home')
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single()

    if (error) {
      setMessage('Could not load your account: ' + error.message)
      return
    }

    setProfile(data)

    if (
      data.is_admin ||
      String(data.telegram_id) === OWNER_TELEGRAM_ID
    ) {
      setPage('admin')
      await loadAdminData()
    } else {
      setPage('member')
    }
  }

  async function loadAdminData() {
    const [m, d, w] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('deposits').select('*').order('created_at', { ascending: false }),
      supabase.from('withdrawals').select('*').order('created_at', { ascending: false })
    ])

    if (!m.error) setMembers(m.data || [])
    if (!d.error) setDeposits(d.data || [])
    if (!w.error) setWithdrawals(w.data || [])
  }

  function updateForm(event) {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  async function register(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const initData = window.Telegram?.WebApp?.initData

      if (!initData) {
        throw new Error('Open GOLDEN from the Mubby Telegram bot.')
      }

      const { data, error } = await supabase.functions.invoke(
        'create-account',
        {
          body: { initData, ...form }
        }
      )

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password
        })

      if (loginError) throw loginError

      await loadProfile()
    } catch (error) {
      const text = error.message || 'Registration failed.'

      if (
        text.includes('409') ||
        text.toLowerCase().includes('already exists') ||
        text.toLowerCase().includes('already registered')
      ) {
        setMessage('Your account may already exist. Please use Login instead.')
        setPage('login')
      } else {
        setMessage(text)
      }
    } finally {
      setLoading(false)
    }
  }

  async function login(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error

      await loadProfile()
    } catch (error) {
      setMessage(error.message || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  async function continueToPayment() {
    if (!profile) {
      setMessage('Please log in first.')
      return
    }

    setPage('payment')
    setMessage('')
  }

  async function submitPayment(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (transactionHash.trim().length < 20) {
        throw new Error('Please enter a valid transaction hash.')
      }

      const { data, error } = await supabase.functions.invoke(
        'submit-deposit',
        {
          body: {
            planId: plan,
            transactionHash: transactionHash.trim()
          }
        }
      )

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      setPage('pending')
      setMessage('Payment submitted for admin verification.')
    } catch (error) {
      setMessage(error.message || 'Payment submission failed.')
    } finally {
      setLoading(false)
    }
  }

  async function copyWallet() {
    try {
      await navigator.clipboard.writeText(PAYMENT_WALLET)
      setMessage('Wallet address copied.')
    } catch {
      setMessage('Please copy the wallet address manually.')
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    setProfile(null)
    setPage('home')
    setMessage('You have logged out.')
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">GOLDEN</div>
        <span className="badge">MEMBERSHIP</span>
      </header>

      {page === 'home' && (
        <>
          <section className="hero">
            <h1>Welcome to GOLDEN</h1>
            <p>Choose your membership plan to get started.</p>
          </section>

          <section className="plans">
            {Object.entries(plans).map(([id, item]) => (
              <button
                type="button"
                className={`plan ${plan === id ? 'selected' : ''}`}
                key={id}
                onClick={() => setPlan(id)}
              >
                <h2>{item.name}</h2>
                <h3>${item.price}</h3>
                <p>${item.daily} daily reward</p>
                <p>{item.days} days</p>
              </button>
            ))}
          </section>

          <div className="selected-summary">
            Selected: {selectedPlan.name} — ${selectedPlan.price}
          </div>

          <button className="primary" onClick={() => setPage('register')}>
            Create account
          </button>

          <button className="back" onClick={() => setPage('login')}>
            Already registered? Login
          </button>
        </>
      )}

      {page === 'register' && (
        <section className="registration">
          <h2>Create your GOLDEN account</h2>

          <form onSubmit={register}>
            <input name="fullName" placeholder="Full name" value={form.fullName} onChange={updateForm} required />
            <input name="username" placeholder="Username" value={form.username} onChange={updateForm} required />
            <input name="email" type="email" placeholder="Email address" value={form.email} onChange={updateForm} required />
            <input name="password" type="password" placeholder="Password (minimum 10 characters)" value={form.password} onChange={updateForm} minLength={10} required />
            <input name="referralCode" placeholder="Referral code (optional)" value={form.referralCode} onChange={updateForm} />

            <button className="primary" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <button className="back" onClick={() => setPage('home')}>Back</button>
          <button className="back" onClick={() => setPage('login')}>Already registered? Login</button>
        </section>
      )}

      {page === 'login' && (
        <section className="registration">
          <h2>Login to GOLDEN</h2>

          <form onSubmit={login}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />

            <button className="primary" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <button className="back" onClick={() => setPage('home')}>Back</button>
        </section>
      )}

      {page === 'payment' && (
        <section className="registration">
          <h2>Complete your payment</h2>
          <p>Plan: {selectedPlan.name}</p>
          <h2>${selectedPlan.price} USDT</h2>
          <p>Network: USDT BEP20 (BNB Smart Chain)</p>
          <p>Send the exact amount to this wallet:</p>

          <p style={{ overflowWrap: 'anywhere' }}>
            {PAYMENT_WALLET}
          </p>

          <button className="primary" type="button" onClick={copyWallet}>
            Copy wallet address
          </button>

          <form onSubmit={submitPayment}>
            <input
              value={transactionHash}
              onChange={e => setTransactionHash(e.target.value)}
              placeholder="Paste transaction hash"
              required
            />

            <button className="primary" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit payment'}
            </button>
          </form>

          <button className="back" onClick={() => setPage('member')}>Back</button>
        </section>
      )}

      {page === 'pending' && (
        <section className="hero">
          <h2>Payment submitted</h2>
          <p>Your payment is awaiting admin verification.</p>
          <button className="primary" onClick={() => setPage('member')}>Continue</button>
        </section>
      )}

      {page === 'member' && (
        <section className="hero">
          <h2>Welcome, {profile?.full_name || 'Member'}</h2>
          <p>Your GOLDEN account is ready.</p>
          <p>Membership and rewards become available after payment approval.</p>

          <button className="primary" onClick={continueToPayment}>
            Continue to payment
          </button>

          <button className="back" onClick={logout}>Logout</button>
        </section>
      )}

      {page === 'admin' && (
        <section className="registration">
          <h2>GOLDEN Admin Dashboard</h2>
          <p>Welcome, {profile?.full_name || 'Admin'}</p>
          <p>Total members: {members.length}</p>
          <p>Payment submissions: {deposits.length}</p>
          <p>Withdrawal requests: {withdrawals.length}</p>

          <h3>Recent members</h3>
          {members.slice(0, 10).map(member => (
            <p key={member.id}>
              {member.full_name} — {member.email}
            </p>
          ))}

          <h3>Recent deposits</h3>
          {deposits.slice(0, 10).map(deposit => (
            <p key={deposit.id}>
              {deposit.amount} USDT — {deposit.status}
            </p>
          ))}

          <h3>Recent withdrawals</h3>
          {withdrawals.slice(0, 10).map(item => (
            <p key={item.id}>
              {item.amount} USDT — {item.status}
            </p>
          ))}

          <button className="back" onClick={loadAdminData}>Refresh</button>
          <button className="back" onClick={logout}>Logout</button>
        </section>
      )}

      {message && <p role="status">{message}</p>}

      <footer>
        <p>GOLDEN • Powered by Mubby</p>
      </footer>
    </main>
  )
}
