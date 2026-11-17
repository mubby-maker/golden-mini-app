import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const PAYMENT_WALLET = '0xF8354B188fAC6B6341273641de4F014921F82032'
const OWNER_TELEGRAM_ID = '9278551040'
const MINIMUM_WITHDRAWAL = 10

const plans = {
  starter: { name: 'Starter', price: 1, daily: 1, days: 30 },
  premium: { name: 'Premium', price: 5, daily: 7, days: 15 }
}

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = seconds % 60

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(remaining).padStart(2, '0')
  ].join(':')
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2)
}

export default function App() {
  const [page, setPage] = useState('home')
  const [plan, setPlan] = useState('starter')
  const [profile, setProfile] = useState(null)

  const [telegramChecked, setTelegramChecked] = useState(false)
  const [insideTelegram, setInsideTelegram] = useState(false)

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

  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawWallet, setWithdrawWallet] = useState('')
  const [paidHash, setPaidHash] = useState({})

  const [members, setMembers] = useState([])
  const [deposits, setDeposits] = useState([])
  const [withdrawals, setWithdrawals] = useState([])

  const [membership, setMembership] = useState(null)
  const [cycle, setCycle] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [now, setNow] = useState(Date.now())

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedPlan = plans[plan]

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    const validTelegram = Boolean(tg?.initData)

    setInsideTelegram(validTelegram)
    setTelegramChecked(true)

    if (validTelegram) {
      tg.ready()
      tg.expand()
      checkSession()
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  async function checkSession() {
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error

      if (data.session) {
        await loadProfile('member')
      }
    } catch (error) {
      setMessage(error.message || 'Unable to check your session.')
    }
  }

  async function loadProfile(nextPage = 'member') {
    const { data: authData, error: authError } =
      await supabase.auth.getUser()

    if (authError) throw authError

    if (!authData.user) {
      setProfile(null)
      setPage('home')
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single()

    if (error) throw error

    setProfile(data)

    const admin = Boolean(
      data.is_admin ||
      String(data.telegram_id) === OWNER_TELEGRAM_ID
    )

    if (admin && nextPage === 'member') {
      setPage('admin')
      await loadAdminData()
    } else {
      setPage(nextPage)

      if (nextPage === 'member') {
        await loadMemberData(data.id)
      }
    }
  }

  async function loadMemberData(userId = profile?.id) {
    if (!userId) return

    const [membershipResult, transactionResult, withdrawalResult] =
      await Promise.all([
        supabase
          .from('memberships')
          .select('*, plans(*)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),

        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),

        supabase
          .from('withdrawals')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      ])

    if (membershipResult.error) throw membershipResult.error
    if (transactionResult.error) throw transactionResult.error
    if (withdrawalResult.error) throw withdrawalResult.error

    const currentMembership = membershipResult.data?.[0] || null

    setMembership(currentMembership)
    setTransactions(transactionResult.data || [])
    setWithdrawals(withdrawalResult.data || [])

    if (currentMembership?.status === 'active') {
      const { data, error } = await supabase
        .from('reward_cycles')
        .select('*')
        .eq('membership_id', currentMembership.id)
        .in('status', ['running', 'claimable'])
        .order('started_at', { ascending: false })
        .limit(1)

      if (error) throw error
      setCycle(data?.[0] || null)
    } else {
      setCycle(null)
    }
  }

  async function loadAdminData() {
    const [m, d, w] = await Promise.all([
      supabase.from('profiles')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase.from('deposits')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase.from('withdrawals')
        .select('*')
        .order('created_at', { ascending: false })
    ])

    if (m.error) throw m.error
    if (d.error) throw d.error
    if (w.error) throw w.error

    setMembers(m.data || [])
    setDeposits(d.data || [])
    setWithdrawals(w.data || [])
  }

  function goHome() {
    setMessage('')
    setPage('home')
  }

  async function openMemberDashboard() {
    setLoading(true)
    setMessage('')

    try {
      await loadMemberData()
      setPage('member')
    } catch (error) {
      setMessage(error.message || 'Unable to load dashboard.')
    } finally {
      setLoading(false)
    }
  }

  async function openAdminDashboard() {
    setLoading(true)
    setMessage('')

    try {
      await loadAdminData()
      setPage('admin')
    } catch (error) {
      setMessage(error.message || 'Unable to load admin dashboard.')
    } finally {
      setLoading(false)
    }
  }

  function updateForm(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value
    })
  }

  async function register(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const initData = window.Telegram?.WebApp?.initData

      if (!initData) {
        throw new Error('Please open GOLDEN through Mubby on Telegram.')
      }

      const { data, error } =
        await supabase.functions.invoke('create-account', {
          body: { initData, ...form }
        })

      if (error) {
        let details = {}

        try {
          details = await error.context.json()
        } catch {
          details = { error: error.message }
        }

        throw new Error(details?.error || details?.message || error.message)
      }

      if (data?.error) throw new Error(data.error)

      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password
        })

      if (loginError) throw loginError

      await loadProfile('payment')
    } catch (error) {
      const text = error.message || 'Registration failed.'

      if (
        text.includes('409') ||
        text.toLowerCase().includes('already exists') ||
        text.toLowerCase().includes('already registered')
      ) {
        setPage('login')
        setMessage('Your account may already exist. Please log in.')
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

      await loadProfile('member')
    } catch (error) {
      setMessage(error.message || 'Login failed.')
    } finally {
      setLoading(false)
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

      const { data, error } =
        await supabase.functions.invoke('submit-deposit', {
          body: {
            planId: plan,
            transactionHash: transactionHash.trim()
          }
        })

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

  async function startReward() {
    setLoading(true)
    setMessage('')

    try {
      const { data, error } =
        await supabase.functions.invoke('start-reward-cycle', {
          body: {}
        })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      await loadMemberData()
      setMessage('Your 24-hour reward countdown has started!')
    } catch (error) {
      setMessage(error.message || 'Unable to start reward cycle.')
    } finally {
      setLoading(false)
    }
  }

  async function claimReward() {
    setLoading(true)
    setMessage('')

    try {
      const { data, error } =
        await supabase.functions.invoke('claim-reward-cycle', {
          body: {}
        })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      await loadMemberData()

      setMessage(
        `Reward claimed: $${formatMoney(data.claimed_amount)}`
      )
    } catch (error) {
      setMessage(error.message || 'Unable to claim reward.')
    } finally {
      setLoading(false)
    }
  }

  async function requestWithdrawal(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const amount = Number(withdrawAmount)
      const wallet = withdrawWallet.trim()

      if (!Number.isFinite(amount) || amount < MINIMUM_WITHDRAWAL) {
        throw new Error(`Minimum withdrawal is $${MINIMUM_WITHDRAWAL} USDT.`)
      }

      if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        throw new Error('Enter a valid BNB Smart Chain wallet address.')
      }

      const { data, error } =
        await supabase.functions.invoke('request-withdrawal', {
          body: {
            amount,
            wallet_address: wallet
          }
        })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      setWithdrawAmount('')
      await loadMemberData()

      setMessage('Withdrawal request submitted. Your funds are reserved.')
    } catch (error) {
      setMessage(error.message || 'Withdrawal request failed.')
    } finally {
      setLoading(false)
    }
  }

  async function reviewWithdrawal(withdrawalId, action) {
    let transactionHashValue = null

    if (action === 'paid') {
      transactionHashValue = window.prompt(
        'Enter the blockchain transaction hash for this payout:'
      )

      if (!transactionHashValue || transactionHashValue.trim().length < 10) {
        setMessage('A valid transaction hash is required.')
        return
      }
    }

    const confirmed = window.confirm(
      `Are you sure you want to ${action} this withdrawal?`
    )

    if (!confirmed) return

    setLoading(true)
    setMessage('')

    try {
      const { data, error } =
        await supabase.functions.invoke('admin-review-withdrawal', {
          body: {
            withdrawal_id: withdrawalId,
            action,
            transaction_hash: transactionHashValue
          }
        })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      await loadAdminData()
      setMessage(`Withdrawal ${action} completed.`)
    } catch (error) {
      setMessage(error.message || 'Withdrawal review failed.')
    } finally {
      setLoading(false)
    }
  }

  async function reviewDeposit(depositId, action) {
    const confirmed = window.confirm(
      `Are you sure you want to ${action} this deposit?`
    )

    if (!confirmed) return

    setLoading(true)
    setMessage('')

    try {
      const { data, error } =
        await supabase.functions.invoke('admin-review-deposit', {
          body: {
            deposit_id: depositId,
            action
          }
        })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      setMessage(data?.message || 'Deposit review completed.')
      await loadAdminData()
    } catch (error) {
      setMessage(error.message || 'Deposit review failed.')
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await supabase.auth.signOut()

    setProfile(null)
    setMembership(null)
    setCycle(null)
    setTransactions([])
    setWithdrawals([])
    setMessage('You have logged out.')
    setPage('home')
  }

  const balance = transactions.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  )

  const claimTime = cycle
    ? new Date(cycle.claimable_at).getTime()
    : 0

  const remaining = Math.max(0, claimTime - now)
  const isClaimable = Boolean(cycle && remaining === 0)

  const completedDays = transactions.filter(
    item => item.type === 'reward' && Number(item.amount) > 0
  ).length

  const isAdmin = Boolean(
    profile?.is_admin ||
    String(profile?.telegram_id) === OWNER_TELEGRAM_ID
  )

  if (!telegramChecked) {
    return (
      <main className="app">
        <section className="hero">
          <h1>GOLDEN</h1>
          <p>Loading...</p>
        </section>
      </main>
    )
  }

  if (!insideTelegram) {
    return (
      <main className="app">
        <header className="topbar">
          <div className="brand">GOLDEN</div>
          <span className="badge">MEMBERSHIP</span>
        </header>

        <section className="hero">
          <h1>Welcome to GOLDEN</h1>
          <p>Please open GOLDEN through the Mubby Telegram bot.</p>
          <a href="https://t.me/Mrmubby_bot" className="primary">
            Open Mubby on Telegram
          </a>
        </section>

        <footer>GOLDEN • Powered by Mubby</footer>
      </main>
    )
  }

  return (
    <main className="app">
      <header className="topbar">
        <button className="brand brand-button" onClick={goHome}>
          GOLDEN
        </button>
        <span className="badge">MEMBERSHIP</span>
      </header>

      {page === 'home' && (
        <>
          <section className="hero">
            <div className="crown">♛</div>
            <div className="eyebrow">WELCOME TO</div>
            <h1>GOLDEN</h1>
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
                <span className="plan-name">{item.name}</span>
                <span className="price">${item.price}</span>
                <span className="daily">${item.daily} daily reward</span>
                <span className="duration">{item.days} days</span>
              </button>
            ))}
          </section>

          {profile ? (
            <section className="home-account">
              <p>Welcome back, {profile.full_name}.</p>

              {isAdmin ? (
                <button
                  className="primary"
                  onClick={openAdminDashboard}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'OPEN ADMIN DASHBOARD'}
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={openMemberDashboard}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'MY MEMBER DASHBOARD'}
                </button>
              )}

              <button className="back" onClick={logout}>Logout</button>
            </section>
          ) : (
            <>
              <button className="primary" onClick={() => setPage('register')}>
                Create account
              </button>

              <button className="back" onClick={() => setPage('login')}>
                Already registered? Login
              </button>
            </>
          )}
        </>
      )}

      {page === 'register' && (
        <section className="registration">
          <button className="back" onClick={goHome}>← BACK TO HOME</button>
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

          <button className="back" onClick={() => setPage('login')}>
            Already registered? Login
          </button>
        </section>
      )}

      {page === 'login' && (
        <section className="registration">
          <button className="back" onClick={goHome}>← BACK TO HOME</button>
          <h2>Login to GOLDEN</h2>

          <form onSubmit={login}>
            <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />

            <button className="primary" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </section>
      )}

      {page === 'payment' && (
        <section className="registration">
          <button className="back" onClick={goHome}>← BACK TO HOME</button>
          <h2>Complete your payment</h2>
          <p>Plan: {selectedPlan.name}</p>
          <h2>${selectedPlan.price} USDT</h2>
          <p>Network: USDT BEP20 (BNB Smart Chain)</p>
          <p>Send the exact amount to this wallet:</p>
          <p className="wallet-address">{PAYMENT_WALLET}</p>

          <button className="primary" type="button" onClick={copyWallet}>
            Copy wallet address
          </button>

          <form onSubmit={submitPayment}>
            <input value={transactionHash} onChange={e => setTransactionHash(e.target.value)} placeholder="Paste transaction hash" required />
            <button className="primary" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit payment'}
            </button>
          </form>
        </section>
      )}

      {page === 'pending' && (
        <section className="hero">
          <button className="back" onClick={goHome}>← BACK TO HOME</button>
          <h2>Payment submitted</h2>
          <p>Your payment is awaiting admin verification.</p>

          <button className="primary" onClick={() => loadProfile('member')} disabled={loading}>
            Refresh membership status
          </button>
        </section>
      )}

      {page === 'member' && (
        <section className="member-dashboard">
          <button className="back" onClick={goHome}>← BACK TO HOME</button>

          <div className="member-heading">
            <span className="eyebrow">YOUR GOLDEN ACCOUNT</span>
            <h2>Welcome, {profile?.full_name || 'Member'}</h2>
          </div>

          <div className="reward-card balance-card">
            <div className="eyebrow">AVAILABLE BALANCE</div>
            <div className="reward-amount">${formatMoney(balance)}</div>
            <p className="muted">USDT • BNB Smart Chain withdrawals</p>
          </div>

          {!membership && (
            <div className="notice">
              <strong>No membership found</strong>
              <p>Choose a plan to get started.</p>
              <button className="primary" onClick={goHome}>View membership plans</button>
            </div>
          )}

          {membership?.status === 'pending' && (
            <div className="notice">
              <strong>Payment awaiting approval</strong>
              <p>Your membership will activate after admin verification.</p>
              <button className="primary" onClick={() => loadMemberData()} disabled={loading}>
                Refresh status
              </button>
            </div>
          )}

          {membership?.status === 'rejected' && (
            <div className="notice">
              <strong>Membership not approved</strong>
              <p>Please contact GOLDEN support before submitting another payment.</p>
            </div>
          )}

          {membership?.status === 'completed' && (
            <div className="notice">
              <strong>Reward plan completed</strong>
              <p>You have completed your membership reward cycles.</p>
            </div>
          )}

          {membership?.status === 'active' && (
            <>
              <div className="reward-card">
                <div className="eyebrow">YOUR DAILY REWARD</div>
                <div className="coin-stage"><div className="gold-coin">G</div></div>
                <div className="reward-amount">
                  ${formatMoney(membership.plans?.daily_reward)}
                </div>
                <p className="muted">USDT reward per completed cycle</p>

                {cycle ? (
                  <>
                    <div className="timer-label">
                      {isClaimable ? 'YOUR REWARD IS READY' : 'NEXT CLAIM IN'}
                    </div>
                    <div className="countdown">
                      {isClaimable ? '00:00:00' : formatTime(remaining)}
                    </div>

                    {isClaimable ? (
                      <button className="primary claim-button" disabled={loading} onClick={claimReward}>
                        {loading ? 'Claiming...' : 'CLAIM REWARD'}
                      </button>
                    ) : (
                      <button className="primary" disabled>REWARD COUNTDOWN RUNNING</button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="timer-label">READY FOR YOUR NEXT CYCLE?</div>
                    <button className="primary start-button" disabled={loading} onClick={startReward}>
                      {loading ? 'Starting...' : 'START'}
                    </button>
                  </>
                )}
              </div>

              <div className="progress-card">
                <h3>REWARD PROGRESS</h3>
                <p>Completed cycles: {completedDays} / {membership.plans?.duration_days || 0}</p>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(100, (completedDays / (membership.plans?.duration_days || 1)) * 100)}%`
                    }}
                  />
                </div>
                <p>
                  Membership expires: {
                    membership.expires_at
                      ? new Date(membership.expires_at).toLocaleDateString()
                      : 'Not set'
                  }
                </p>
              </div>
            </>
          )}

          <div className="progress-card">
            <h3>WITHDRAW USDT</h3>
            <p>Minimum withdrawal: ${MINIMUM_WITHDRAWAL.toFixed(2)} USDT</p>
            <p className="muted">Maximum one request per day. Network: USDT BEP20.</p>

            <form onSubmit={requestWithdrawal}>
              <input
                type="number"
                min={MINIMUM_WITHDRAWAL}
                step="0.01"
                placeholder="Amount in USDT"
                value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value)}
                required
              />

              <input
                type="text"
                placeholder="Your 0x BNB Smart Chain wallet address"
                value={withdrawWallet}
                onChange={e => setWithdrawWallet(e.target.value)}
                required
              />

              <button className="primary" disabled={loading || balance < MINIMUM_WITHDRAWAL}>
                {loading ? 'Submitting...' : 'REQUEST WITHDRAWAL'}
              </button>
            </form>

            {balance < MINIMUM_WITHDRAWAL && (
              <p className="muted">Your available balance must reach $10 before you can withdraw.</p>
            )}
          </div>

          <div className="progress-card">
            <h3>WITHDRAWAL HISTORY</h3>

            {withdrawals.length === 0 && <p className="muted">No withdrawal requests yet.</p>}

            {withdrawals.map(item => (
              <div className="history-row" key={item.id}>
                <div>
                  <strong>${formatMoney(item.amount)} USDT</strong>
                  <p className="small-text">{new Date(item.created_at).toLocaleString()}</p>
                  <p className="small-text">Status: {item.status}</p>
                  {item.transaction_hash && <p className="small-text">Tx: {item.transaction_hash}</p>}
                </div>
              </div>
            ))}
          </div>

          <div className="progress-card">
            <h3>TRANSACTION HISTORY</h3>

            {transactions.length === 0 && <p className="muted">No transactions yet.</p>}

            {transactions.map(item => (
              <div className="history-row" key={item.id}>
                <span>
                  {item.description || item.type}
                  <small>{new Date(item.created_at).toLocaleDateString()}</small>
                </span>
                <strong className={Number(item.amount) < 0 ? 'negative-amount' : ''}>
                  {Number(item.amount) >= 0 ? '+' : ''}${formatMoney(item.amount)}
                </strong>
              </div>
            ))}
          </div>

          <button className="back" onClick={() => loadMemberData()} disabled={loading}>
            Refresh dashboard
          </button>

          <button className="back" onClick={logout}>Logout</button>
        </section>
      )}

      {page === 'admin' && (
        <section className="registration">
          <button className="back" onClick={goHome}>← BACK TO HOME</button>

          <h2>GOLDEN Admin Dashboard</h2>
          <p>Welcome, {profile?.full_name || 'Admin'}</p>

          <div className="admin-stats">
            <div>Total members: <strong>{members.length}</strong></div>
            <div>Payment submissions: <strong>{deposits.length}</strong></div>
            <div>Withdrawal requests: <strong>{withdrawals.length}</strong></div>
          </div>

          <h3>Recent members</h3>
          {members.slice(0, 10).map(member => (
            <p key={member.id}>{member.full_name} — {member.email}</p>
          ))}

          <h3>Deposit submissions</h3>
          {deposits.length === 0 && <p>No deposits submitted.</p>}

          {deposits.slice(0, 20).map(deposit => (
            <div className="admin-item" key={deposit.id}>
              <strong>{formatMoney(deposit.amount)} USDT</strong>
              <p>Status: {deposit.status}</p>
              <p>Transaction: {deposit.transaction_hash || 'Not supplied'}</p>
              <p className="small-text">Deposit ID: {deposit.id}</p>

              {deposit.status === 'pending' && (
                <div className="admin-actions">
                  <button className="primary" disabled={loading} onClick={() => reviewDeposit(deposit.id, 'approve')}>Approve</button>
                  <button className="danger" disabled={loading} onClick={() => reviewDeposit(deposit.id, 'reject')}>Reject</button>
                </div>
              )}
            </div>
          ))}

          <h3>Withdrawal requests</h3>
          {withdrawals.length === 0 && <p>No withdrawals submitted.</p>}

          {withdrawals.map(item => (
            <div className="admin-item" key={item.id}>
              <strong>{formatMoney(item.amount)} USDT</strong>
              <p>Status: {item.status}</p>
              <p>Wallet: {item.wallet_address}</p>
              <p>Network: {item.network}</p>
              <p className="small-text">Request ID: {item.id}</p>

              {item.transaction_hash && (
                <p className="small-text">Transaction hash: {item.transaction_hash}</p>
              )}

              {item.status === 'pending' && (
                <div className="admin-actions">
                  <button className="primary" disabled={loading} onClick={() => reviewWithdrawal(item.id, 'approve')}>
                    Approve
                  </button>
                  <button className="danger" disabled={loading} onClick={() => reviewWithdrawal(item.id, 'reject')}>
                    Reject
                  </button>
                </div>
              )}

              {item.status === 'approved' && (
                <div className="admin-actions">
                  <button className="primary" disabled={loading} onClick={() => reviewWithdrawal(item.id, 'paid')}>
                    Mark as paid
                  </button>
                  <button className="danger" disabled={loading} onClick={() => reviewWithdrawal(item.id, 'reject')}>
                    Reject and refund
                  </button>
                </div>
              )}
            </div>
          ))}

          <button className="back" onClick={loadAdminData} disabled={loading}>
            Refresh admin dashboard
          </button>

          <button className="back" onClick={logout}>Logout</button>
        </section>
      )}

      {message && (
        <p className="status-message" role="status">{message}</p>
      )}

      <footer><p>GOLDEN • Powered by Mubby</p></footer>
    </main>
  )
}
