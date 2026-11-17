import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const PAYMENT_WALLET = '0xF8354B188fAC6B6341273641de4F014921F82032'
const OWNER_TELEGRAM_ID = '9278551040'

const plans = {
  starter: {
    name: 'Starter',
    price: 1,
    daily: 1,
    days: 30
  },
  premium: {
    name: 'Premium',
    price: 5,
    daily: 7,
    days: 15
  }
}

export default function App() {
  const [page, setPage] = useState('home')
  const [plan, setPlan] = useState('starter')
  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    referralCode: ''
  })
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: ''
  })
  const [transactionHash, setTransactionHash] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState(null)
  const [copied, setCopied] = useState(false)
  const [adminData, setAdminData] = useState({
    members: [],
    deposits: [],
    withdrawals: []
  })

  const selectedPlan = plans[plan]
  const isAdmin = profile?.is_admin === true ||
    String(profile?.telegram_id) === OWNER_TELEGRAM_ID

  useEffect(() => {
    const telegram = window.Telegram?.WebApp
    telegram?.ready()
    telegram?.expand()

    checkExistingSession()

    return () => {
      telegram?.BackButton?.hide()
    }
  }, [])

  useEffect(() => {
    const telegramBack = window.Telegram?.WebApp?.BackButton
    if (!telegramBack) return

    const canGoBack = ['register', 'payment', 'login', 'admin'].includes(page)

    if (canGoBack) {
      telegramBack.show()
      telegramBack.onClick(goBack)
    } else {
      telegramBack.hide()
    }

    return () => telegramBack.offClick(goBack)
  }, [page])

  async function checkExistingSession() {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.user) {
      await loadProfile(data.session.user.id)
    }
  }

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      setMessage('Could not load your GOLDEN profile.')
      return
    }

    setProfile(data)
    setPage(data.is_admin ? 'admin' : 'member')
    if (data.is_admin) loadAdminData()
  }

  function goBack() {
    setMessage('')

    if (page === 'payment') setPage('register')
    else if (page === 'register' || page === 'login') setPage('home')
    else if (page === 'admin' || page === 'member') setPage('home')
    else setPage('home')
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
        throw new Error('Please open GOLDEN through the Mubby Telegram bot.')
      }

      const { data, error } = await supabase.functions.invoke(
        'create-account',
        {
          body: {
            initData,
            ...form
          }
        }
      )

      if (error) {
        const details = await error.context?.json?.().catch(() => null)
        throw new Error(details?.error || error.message)
      }

      if (data?.error) throw new Error(data.error)

      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password
        })

      if (loginError) throw loginError

      const { data: userData } = await supabase.auth.getUser()

      if (userData?.user) {
        await loadProfile(userData.user.id)
      }

      setMessage('Your GOLDEN account has been created.')
    } catch (error) {
      setMessage(error.message || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  async function login(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password
      })

      if (error) throw error

      await loadProfile(data.user.id)
    } catch (error) {
      setMessage(error.message || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    setProfile(null)
    setPage('home')
    setMessage('You have signed out.')
  }

  async function copyWallet() {
    try {
      await navigator.clipboard.writeText(PAYMENT_WALLET)
      setCopied(true)
      setMessage('Wallet address copied.')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setMessage('Copy unavailable. Please select and copy the address manually.')
    }
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

      if (error) {
        const details = await error.context?.json?.().catch(() => null)
        throw new Error(details?.error || error.message)
      }

      if (data?.error) throw new Error(data.error)

      setPage('pending')
      setMessage('Your payment submission has been received.')
    } catch (error) {
      setMessage(error.message || 'Payment submission failed.')
    } finally {
      setLoading(false)
    }
  }

  async function loadAdminData() {
    setLoading(true)

    const [members, deposits, withdrawals] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('deposits').select('*').order('created_at', { ascending: false }),
      supabase.from('withdrawals').select('*').order('created_at', { ascending: false })
    ])

    setAdminData({
      members: members.data || [],
      deposits: deposits.data || [],
      withdrawals: withdrawals.data || []
    })

    if (members.error || deposits.error || withdrawals.error) {
      setMessage('Some Admin information could not be loaded.')
    }

    setLoading(false)
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">GOLDEN</div>
        <span className="badge">
          {isAdmin ? 'ADMIN' : 'MEMBERSHIP'}
        </span>
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
            Already registered? Log in
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

          <button className="back" onClick={goBack}>Back</button>
        </section>
      )}

      {page === 'login' && (
        <section className="registration">
          <h2>Welcome back</h2>

          <form onSubmit={login}>
            <input
              type="email"
              placeholder="Email address"
              value={loginForm.email}
              onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={loginForm.password}
              onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
              required
            />

            <button className="primary" disabled={loading}>
              {loading ? 'Logging in...' : 'Log in'}
            </button>
          </form>

          <button className="back" onClick={goBack}>Back</button>
        </section>
      )}

      {page === 'payment' && (
        <section className="registration">
          <button className="back" onClick={goBack}>← Back</button>

          <h2>Complete your payment</h2>
          <p>Plan: {selectedPlan.name}</p>
          <h2>${selectedPlan.price} USDT</h2>
          <p>Network: USDT BEP20 (BNB Smart Chain)</p>
          <p>Send the exact amount to this wallet:</p>

          <p style={{ overflowWrap: 'anywhere' }}>{PAYMENT_WALLET}</p>

          <button type="button" className="primary" onClick={copyWallet}>
            {copied ? 'Copied!' : 'Copy wallet address'}
          </button>

          <form onSubmit={submitPayment}>
            <input
              value={transactionHash}
              onChange={event => setTransactionHash(event.target.value)}
              placeholder="Paste transaction hash"
              required
            />

            <button className="primary" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit payment'}
            </button>
          </form>
        </section>
      )}

      {page === 'pending' && (
        <section className="hero">
          <h2>Payment submitted</h2>
          <p>Your payment is awaiting Admin verification.</p>
          <button className="back" onClick={logout}>Sign out</button>
        </section>
      )}

      {page === 'member' && (
        <section className="hero">
          <h2>Welcome, {profile?.full_name}</h2>
          <p>Your GOLDEN member account is ready.</p>
          <p>Membership and reward details will appear here.</p>
          <button className="back" onClick={logout}>Sign out</button>
        </section>
      )}

      {page === 'admin' && (
        <section className="registration">
          <h2>GOLDEN Admin Dashboard</h2>
          <p>Welcome, {profile?.full_name || 'Admin'} 👑</p>

          <div className="selected-summary">
            <h3>Members: {adminData.members.length}</h3>
            <h3>Deposits: {adminData.deposits.length}</h3>
            <h3>Withdrawal requests: {adminData.withdrawals.length}</h3>
          </div>

          <h3>Recent members</h3>
          {adminData.members.slice(0, 10).map(member => (
            <p key={member.id}>
              {member.full_name} — {member.email}
            </p>
          ))}

          <h3>Recent deposits</h3>
          {adminData.deposits.slice(0, 10).map(deposit => (
            <p key={deposit.id}>
              ${deposit.amount} — {deposit.status}
            </p>
          ))}

          <h3>Recent withdrawals</h3>
          {adminData.withdrawals.slice(0, 10).map(withdrawal => (
            <p key={withdrawal.id}>
              ${withdrawal.amount} — {withdrawal.status}
            </p>
          ))}

          <button className="primary" onClick={loadAdminData} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh dashboard'}
          </button>

          <button className="back" onClick={logout}>Sign out</button>
        </section>
      )}

      {message && <p role="status">{message}</p>}

      <footer>
        <p>GOLDEN • Powered by Mubby</p>
      </footer>
    </main>
  )
}
