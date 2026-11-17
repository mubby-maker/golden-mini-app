import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import {
  Crown, Wallet, Gift, Users, LogOut, Home, Clock,
  CheckCircle, XCircle, RefreshCw, ArrowDownToLine,
  ShieldCheck, Copy, ExternalLink, Menu, X, CreditCard,
  History, User, AlertCircle
} from 'lucide-react'

const ADMIN_TELEGRAM_ID = '9278551040'
const PAYMENT_WALLET = '0xF8354B188fAC6B6341273641de4F014921F82032'
const NETWORK = 'USDT BEP20'
const MINIMUM_WITHDRAWAL = 10
const REFERRAL_BONUS = 0.70

const PLANS = [
  { id: 'starter', name: 'Starter', price: 1, reward: 1, days: 30 },
  { id: 'premium', name: 'Premium', price: 5, reward: 7, days: 15 }
]

const money = value => `$${Number(value || 0).toFixed(2)}`

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [page, setPage] = useState('home')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [authMode, setAuthMode] = useState('login')

  const [selectedPlan, setSelectedPlan] = useState('starter')
  const [transactionHash, setTransactionHash] = useState('')
  const [membershipId, setMembershipId] = useState('')

  const [memberships, setMemberships] = useState([])
  const [transactions, setTransactions] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [referrals, setReferrals] = useState([])
  const [cycles, setCycles] = useState([])
  const [deposits, setDeposits] = useState([])
  const [members, setMembers] = useState([])
  const [adminWithdrawals, setAdminWithdrawals] = useState([])

  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawWallet, setWithdrawWallet] = useState('')

  const telegram = window.Telegram?.WebApp
  const initData = telegram?.initData || ''
  const telegramUser = telegram?.initDataUnsafe?.user

  const isAdmin = profile?.is_admin === true &&
    String(profile?.telegram_id || '') === ADMIN_TELEGRAM_ID

  const balance = useMemo(
    () => transactions.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [transactions]
  )

  useEffect(() => {
    telegram?.ready()
    telegram?.expand()

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession)
      }
    )

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session?.user) {
      loadProfile()
    } else {
      setProfile(null)
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (profile) {
      loadMemberData()
      if (isAdmin) loadAdminData()
    }
  }, [profile])

  useEffect(() => {
    if (!profile) return
    const timer = setInterval(() => {
      loadMemberData()
    }, 30000)
    return () => clearInterval(timer)
  }, [profile])

  function notify(text, isError = false) {
    setMessage(isError ? '' : text)
    setError(isError ? text : '')
    setTimeout(() => {
      setMessage('')
      setError('')
    }, 6000)
  }

  async function loadProfile() {
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()

    if (profileError) {
      notify(profileError.message, true)
      return
    }

    setProfile(data)
    setPage(
      data.is_admin && String(data.telegram_id) === ADMIN_TELEGRAM_ID
        ? 'admin'
        : 'dashboard'
    )
  }

  async function loadMemberData() {
    if (!session?.user) return

    const userId = session.user.id

    const [
      membershipResult,
      transactionResult,
      withdrawalResult,
      referralResult,
      cycleResult
    ] = await Promise.all([
      supabase.from('memberships').select('*, plans(*)')
        .eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('transactions').select('*')
        .eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('withdrawals').select('*')
        .eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('referrals').select('*')
        .eq('referrer_id', userId).order('created_at', { ascending: false }),
      supabase.from('reward_cycles').select('*')
        .eq('user_id', userId).order('created_at', { ascending: false })
    ])

    if (membershipResult.error) notify(membershipResult.error.message, true)
    else setMemberships(membershipResult.data || [])

    if (transactionResult.error) notify(transactionResult.error.message, true)
    else setTransactions(transactionResult.data || [])

    if (withdrawalResult.error) notify(withdrawalResult.error.message, true)
    else setWithdrawals(withdrawalResult.data || [])

    if (referralResult.error) notify(referralResult.error.message, true)
    else setReferrals(referralResult.data || [])

    if (cycleResult.error) notify(cycleResult.error.message, true)
    else setCycles(cycleResult.data || [])
  }

  async function loadAdminData() {
    const [
      depositResult,
      withdrawalResult,
      memberResult
    ] = await Promise.all([
      supabase.from('deposits').select('*, profiles(full_name,email,username), memberships(plan_id,status)')
        .order('created_at', { ascending: false }),
      supabase.from('withdrawals').select('*, profiles(full_name,email,username)')
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('*')
        .order('created_at', { ascending: false })
    ])

    if (depositResult.error) notify(depositResult.error.message, true)
    else setDeposits(depositResult.data || [])

    if (withdrawalResult.error) notify(withdrawalResult.error.message, true)
    else setAdminWithdrawals(withdrawalResult.data || [])

    if (memberResult.error) notify(memberResult.error.message, true)
    else setMembers(memberResult.data || [])
  }

  async function register(event) {
    event.preventDefault()
    setBusy(true)

    try {
      if (!initData) {
        throw new Error('Open GOLDEN from the Mubby Telegram bot to register.')
      }

      const { data, error: functionError } = await supabase.functions.invoke(
        'create-account',
        {
          body: {
            initData,
            full_name: fullName.trim(),
            username: username.trim(),
            email: email.trim(),
            password,
            referral_code: referralCode.trim() || null
          }
        }
      )

      if (functionError) throw functionError
      if (data?.error) throw new Error(data.error)

      notify('Account created. Please log in.')
      setAuthMode('login')
    } catch (err) {
      notify(err.message || 'Registration failed.', true)
    } finally {
      setBusy(false)
    }
  }

  async function login(event) {
    event.preventDefault()
    setBusy(true)

    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })

      if (loginError) throw loginError
    } catch (err) {
      notify(err.message || 'Login failed.', true)
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
    setPage('home')
  }

  async function submitDeposit(event) {
    event.preventDefault()
    if (!session?.access_token) return notify('Please log in again.', true)

    setBusy(true)

    try {
      const plan = PLANS.find(item => item.id === selectedPlan)
      if (!plan) throw new Error('Please select a valid plan.')

      const { data, error: functionError } = await supabase.functions.invoke(
        'submit-deposit',
        {
          body: {
            plan_id: plan.id,
            amount: plan.price,
            transaction_hash: transactionHash.trim()
          }
        }
      )

      if (functionError) throw functionError
      if (data?.error) throw new Error(data.error)

      setTransactionHash('')
      notify('Payment submission received. Waiting for admin approval.')
      await loadMemberData()
      setPage('dashboard')
    } catch (err) {
      notify(err.message || 'Could not submit payment.', true)
    } finally {
      setBusy(false)
    }
  }

  async function startReward() {
    setBusy(true)

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        'start-reward-cycle',
        { body: {} }
      )

      if (functionError) throw functionError
      if (data?.error) throw new Error(data.error)

      notify(data?.message || 'Your 24-hour reward cycle has started.')
      await loadMemberData()
    } catch (err) {
      notify(err.message || 'Could not start reward cycle.', true)
    } finally {
      setBusy(false)
    }
  }

  async function claimReward() {
    setBusy(true)

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        'claim-reward-cycle',
        { body: {} }
      )

      if (functionError) throw functionError
      if (data?.error) throw new Error(data.error)

      notify(data?.message || 'Reward claimed successfully.')
      await loadMemberData()
    } catch (err) {
      notify(err.message || 'Could not claim reward.', true)
    } finally {
      setBusy(false)
    }
  }

  async function requestWithdrawal(event) {
    event.preventDefault()
    const amount = Number(withdrawAmount)

    if (!Number.isFinite(amount) || amount < MINIMUM_WITHDRAWAL) {
      return notify(`Minimum withdrawal is ${money(MINIMUM_WITHDRAWAL)}.`, true)
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(withdrawWallet.trim())) {
      return notify('Enter a valid BEP20 wallet address.', true)
    }

    if (amount > balance) return notify('Insufficient available balance.', true)

    setBusy(true)

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        'request-withdrawal',
        {
          body: {
            amount,
            wallet_address: withdrawWallet.trim()
          }
        }
      )

      if (functionError) throw functionError
      if (data?.error) throw new Error(data.error)

      setWithdrawAmount('')
      setWithdrawWallet('')
      notify('Withdrawal request submitted.')
      await loadMemberData()
    } catch (err) {
      notify(err.message || 'Withdrawal request failed.', true)
    } finally {
      setBusy(false)
    }
  }

  async function reviewDeposit(id, action) {
    if (!window.confirm(`Are you sure you want to ${action} this deposit?`)) return

    setBusy(true)

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        'admin-review-deposit',
        { body: { deposit_id: id, action } }
      )

      if (functionError) throw functionError
      if (data?.error) throw new Error(data.error)

      notify(`Deposit ${action}d successfully.`)
      await loadAdminData()
    } catch (err) {
      notify(err.message || 'Could not review deposit.', true)
    } finally {
      setBusy(false)
    }
  }

  async function reviewWithdrawal(id, action) {
    let transaction_hash = null

    if (action === 'paid') {
      transaction_hash = window.prompt('Enter the transaction hash:')
      if (!transaction_hash || transaction_hash.trim().length < 10) {
        return notify('A valid transaction hash is required.', true)
      }
    }

    if (!window.confirm(`Confirm withdrawal ${action}?`)) return

    setBusy(true)

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        'admin-review-withdrawal',
        {
          body: {
            withdrawal_id: id,
            action,
            transaction_hash
          }
        }
      )

      if (functionError) throw functionError
      if (data?.error) throw new Error(data.error)

      notify(`Withdrawal ${action} successfully.`)
      await loadAdminData()
    } catch (err) {
      notify(err.message || 'Could not review withdrawal.', true)
    } finally {
      setBusy(false)
    }
  }

  function copyReferral() {
    const link = `https://t.me/Mrmubby_bot?start=${profile?.referral_code || ''}`
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link)
        .then(() => notify('Referral link copied.'))
        .catch(() => notify(link))
    } else {
      notify(link)
    }
  }

  const activeMembership = memberships.find(item => item.status === 'active')
  const currentCycle = cycles.find(item => item.status === 'running')

  function timeRemaining(date) {
    const difference = new Date(date).getTime() - Date.now()
    if (difference <= 0) return 'Ready to claim'

    const hours = Math.floor(difference / 3600000)
    const minutes = Math.floor((difference % 3600000) / 60000)
    const seconds = Math.floor((difference % 60000) / 1000)

    return `${hours}h ${minutes}m ${seconds}s`
  }

  const [clock, setClock] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const styles = `
    * { box-sizing:border-box }
    body { margin:0;background:#080808;color:#f7f0dc;font-family:Arial,sans-serif }
    .golden { min-height:100vh;background:radial-gradient(circle at top,#211a08 0,#080808 45%);padding:20px 14px 50px }
    .wrap { max-width:1050px;margin:auto }
    .header { display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #3a2c0c;padding:10px 0 20px;gap:12px }
    .brand { font-size:26px;font-weight:900;letter-spacing:4px;color:#e7bd55 }
    .sub { color:#a99b7a;font-size:12px;margin-top:4px }
    .nav { display:flex;flex-wrap:wrap;gap:8px }
    button,.btn { background:linear-gradient(135deg,#f0ce73,#b78324);color:#171107;border:0;border-radius:10px;padding:12px 16px;font-weight:800;cursor:pointer }
    button:disabled { opacity:.45;cursor:not-allowed }
    .secondary { background:#17140d;color:#e9c66e;border:1px solid #70551e }
    .danger { background:#501c18;color:#ffd2c8;border:1px solid #a34438 }
    .card { background:linear-gradient(145deg,#17140e,#0d0d0c);border:1px solid #493719;border-radius:16px;padding:20px;margin:15px 0;box-shadow:0 8px 30px #0005 }
    .hero { padding:45px 25px;text-align:center;border:1px solid #70551e;border-radius:20px;background:linear-gradient(140deg,#1d180c,#0b0b0b) }
    h1,h2,h3 { color:#f0ce73;margin-top:0 }
    p,.muted { color:#b8ad91;line-height:1.55 }
    .grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px }
    .price { font-size:32px;color:#f0ce73;font-weight:900;margin:12px 0 }
    input,select { width:100%;padding:14px;margin:7px 0 14px;background:#090909;color:#fff;border:1px solid #59451e;border-radius:9px;font-size:15px }
    label { color:#d7c99f;font-size:13px }
    .row { display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap }
    .stat { font-size:26px;color:#f0ce73;font-weight:900 }
    .pill { display:inline-block;padding:5px 10px;border-radius:30px;background:#33270e;color:#eac96e;font-size:12px }
    .notice { padding:12px;border-radius:10px;background:#142519;border:1px solid #326b43;color:#a8e7b6;margin:12px 0 }
    .error { padding:12px;border-radius:10px;background:#321713;border:1px solid #874137;color:#ffc1b5;margin:12px 0 }
    .table { width:100%;border-collapse:collapse;font-size:13px }
    .table td,.table th { padding:10px 7px;border-bottom:1px solid #332b1c;text-align:left;vertical-align:top }
    .table th { color:#e7bd55 }
    .actions { display:flex;gap:7px;flex-wrap:wrap }
    .small { font-size:12px;color:#a99b7a }
    .center { text-align:center }
    .bigicon { color:#e7bd55;width:30px;height:30px }
    .mobilemenu { display:none }
    a { color:#f0ce73 }
    @media(max-width:650px) {
      .header { align-items:flex-start }
      .nav { display:none }
      .mobilemenu { display:block }
      .nav.open { display:flex;position:absolute;right:15px;top:75px;z-index:10;background:#17140e;padding:12px;border:1px solid #70551e;border-radius:12px;flex-direction:column }
      .table { min-width:600px }
      .tablewrap { overflow-x:auto }
    }
  `

  function navButton(label, destination, Icon) {
    return (
      <button className="secondary" onClick={() => { setPage(destination); setMenuOpen(false) }}>
        {Icon && <Icon size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />}
        {label}
      </button>
    )
  }

  if (loading) {
    return <div className="golden center"><h2>GOLDEN</h2><p>Loading your account...</p></div>
  }

  return (
    <>
      <style>{styles}</style>
      <div className="golden">
        <div className="wrap">
          <header className="header">
            <div>
              <div className="brand">GOLDEN</div>
              <div className="sub">Your rewards dashboard</div>
            </div>

            <button className="secondary mobilemenu" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X /> : <Menu />}
            </button>

            <nav className={`nav ${menuOpen ? 'open' : ''}`}>
              {navButton('Home', 'home', Home)}
              {session && navButton('Dashboard', 'dashboard', User)}
              {session && navButton('Plans', 'plans', Crown)}
              {session && navButton('Referrals', 'referrals', Users)}
              {session && navButton('Withdraw', 'withdraw', Wallet)}
              {isAdmin && navButton('Admin', 'admin', ShieldCheck)}
              {session && <button className="danger" onClick={logout}><LogOut size={15} /> Logout</button>}
            </nav>
          </header>

          {(message || error) && (
            <div className={error ? 'error' : 'notice'}>{error || message}</div>
          )}

          {page === 'home' && (
            <>
              <section className="hero" style={{ marginTop: 22 }}>
                <Crown className="bigicon" />
                <h1 style={{ fontSize: 38, letterSpacing: 2 }}>WELCOME TO GOLDEN</h1>
                <p>Manage your membership, rewards, referrals and withdrawals in one place.</p>
                {!session ? (
                  <div className="actions" style={{ justifyContent: 'center' }}>
                    <button onClick={() => { setAuthMode('register'); setPage('auth') }}>Create account</button>
                    <button className="secondary" onClick={() => { setAuthMode('login'); setPage('auth') }}>Login</button>
                  </div>
                ) : (
                  <button onClick={() => setPage(isAdmin ? 'admin' : 'dashboard')}>Open dashboard</button>
                )}
              </section>

              <h2 style={{ marginTop: 30 }}>Membership plans</h2>
              <div className="grid">
                {PLANS.map(plan => (
                  <div className="card" key={plan.id}>
                    <h2>{plan.name}</h2>
                    <div className="price">{money(plan.price)}</div>
                    <p>Advertised daily reward: {money(plan.reward)}</p>
                    <p>Membership period: {plan.days} days</p>
                    <button onClick={() => {
                      setSelectedPlan(plan.id)
                      setPage(session ? 'payment' : 'auth')
                      if (!session) setAuthMode('register')
                    }}>Choose plan</button>
                  </div>
                ))}
              </div>
              <p className="small">Rewards are subject to membership terms, available funding and approval. No investment return is guaranteed.</p>
            </>
          )}

          {page === 'auth' && (
            <div className="card" style={{ maxWidth: 520, margin: '30px auto' }}>
              <h2>{authMode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
              {!initData && <div className="error">Open this app through the Mubby Telegram bot to register with your Telegram account.</div>}

              <form onSubmit={authMode === 'register' ? register : login}>
                {authMode === 'register' && (
                  <>
                    <label>Full name</label>
                    <input required value={fullName} onChange={e => setFullName(e.target.value)} />
                    <label>Username</label>
                    <input required value={username} onChange={e => setUsername(e.target.value)} />
                  </>
                )}

                <label>Email</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} />

                <label>Password</label>
                <input type="password" required minLength="6" value={password} onChange={e => setPassword(e.target.value)} />

                {authMode === 'register' && (
                  <>
                    <label>Referral code (optional)</label>
                    <input value={referralCode} onChange={e => setReferralCode(e.target.value)} />
                  </>
                )}

                <button disabled={busy} style={{ width: '100%' }}>
                  {busy ? 'Please wait...' : authMode === 'register' ? 'Create account' : 'Login'}
                </button>
              </form>

              <p className="center">
                {authMode === 'register' ? 'Already registered?' : 'New to GOLDEN?'}
                {' '}
                <a href="#" onClick={e => {
                  e.preventDefault()
                  setAuthMode(authMode === 'register' ? 'login' : 'register')
                }}>{authMode === 'register' ? 'Login' : 'Create account'}</a>
              </p>
            </div>
          )}

          {page === 'plans' && (
            <>
              <h1>Choose your membership</h1>
              <div className="grid">
                {PLANS.map(plan => (
                  <div className="card" key={plan.id}>
                    <h2>{plan.name}</h2>
                    <div className="price">{money(plan.price)}</div>
                    <p>Daily reward amount: {money(plan.reward)}</p>
                    <p>Duration: {plan.days} days</p>
                    <button onClick={() => { setSelectedPlan(plan.id); setPage('payment') }}>Continue</button>
                  </div>
                ))}
              </div>
            </>
          )}

          {page === 'payment' && (
            <div className="card" style={{ maxWidth: 650, margin: '25px auto' }}>
              <h2><CreditCard className="bigicon" /> Payment submission</h2>
              <p>Select a plan and send the exact amount using the BEP20 network.</p>

              <label>Membership plan</label>
              <select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)}>
                {PLANS.map(plan => <option value={plan.id} key={plan.id}>{plan.name} — {money(plan.price)}</option>)}
              </select>

              <div className="card">
                <p>Network</p>
                <h3>{NETWORK}</h3>
                <p>Payment wallet</p>
                <strong style={{ overflowWrap: 'anywhere' }}>{PAYMENT_WALLET}</strong>
                <p className="small">Send only USDT on BNB Smart Chain (BEP20). Sending another token or network may result in loss of funds.</p>
              </div>

              <form onSubmit={submitDeposit}>
                <label>Transaction hash</label>
                <input required value={transactionHash} onChange={e => setTransactionHash(e.target.value)} placeholder="Enter your transaction hash" />
                <button disabled={busy} style={{ width: '100%' }}>Submit payment for review</button>
              </form>
            </div>
          )}

          {page === 'dashboard' && (
            <>
              <div className="row" style={{ marginTop: 25 }}>
                <div>
                  <h1>Welcome, {profile?.full_name || 'Member'}</h1>
                  <p>Your GOLDEN member dashboard</p>
                </div>
                <span className="pill">{profile?.username}</span>
              </div>

              <div className="grid">
                <div className="card"><Wallet className="bigicon" /><p>Available balance</p><div className="stat">{money(balance)}</div></div>
                <div className="card"><Crown className="bigicon" /><p>Membership</p><div className="stat" style={{ fontSize: 20 }}>{activeMembership?.plan_id || 'No active plan'}</div></div>
                <div className="card"><Users className="bigicon" /><p>Successful referrals</p><div className="stat">{referrals.filter(item => item.status === 'credited').length}</div></div>
              </div>

              <div className="card">
                <h2>Reward centre</h2>
                {!activeMembership ? (
                  <>
                    <p>You do not currently have an active membership.</p>
                    <button onClick={() => setPage('plans')}>View plans</button>
                  </>
                ) : (
                  <>
                    <p>Active plan: <strong>{activeMembership.plan_id}</strong></p>
                    <p>Membership expires: {activeMembership.expires_at ? new Date(activeMembership.expires_at).toLocaleString() : 'Not set'}</p>
                    {currentCycle ? (
                      <>
                        <p>Reward amount: <strong>{money(currentCycle.amount)}</strong></p>
                        <div className="stat" style={{ fontSize: 23 }}>
                          {new Date(currentCycle.claimable_at).getTime() <= clock
                            ? 'Reward ready'
                            : timeRemaining(currentCycle.claimable_at)}
                        </div>
                        <button disabled={busy || new Date(currentCycle.claimable_at).getTime() > clock} onClick={claimReward}>
                          Claim reward
                        </button>
                      </>
                    ) : (
                      <>
                        <p>Start a 24-hour reward cycle when you are ready.</p>
                        <button disabled={busy} onClick={startReward}>Start reward cycle</button>
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="card">
                <h2>Recent activity</h2>
                <div className="tablewrap">
                  <table className="table">
                    <thead><tr><th>Type</th><th>Amount</th><th>Description</th><th>Date</th></tr></thead>
                    <tbody>
                      {transactions.slice(0, 15).map(item => (
                        <tr key={item.id}>
                          <td>{item.type}</td>
                          <td>{money(item.amount)}</td>
                          <td>{item.description || '—'}</td>
                          <td>{new Date(item.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                      {!transactions.length && <tr><td colSpan="4">No transactions yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {page === 'referrals' && (
            <>
              <h1>Referral centre</h1>
              <div className="card">
                <Gift className="bigicon" />
                <h2>Earn {money(REFERRAL_BONUS)} per successful referral</h2>
                <p>Your referral bonus is credited only after the referred member's payment is approved.</p>
                <p>Your referral code</p>
                <h2>{profile?.referral_code}</h2>
                <button onClick={copyReferral}><Copy size={15} /> Copy referral link</button>
              </div>
              <div className="card">
                <h2>Your referrals</h2>
                <div className="tablewrap">
                  <table className="table">
                    <thead><tr><th>Joined</th><th>Bonus</th><th>Status</th></tr></thead>
                    <tbody>
                      {referrals.map(item => (
                        <tr key={item.id}>
                          <td>{new Date(item.created_at).toLocaleDateString()}</td>
                          <td>{money(item.bonus_amount)}</td>
                          <td>{item.status}</td>
                        </tr>
                      ))}
                      {!referrals.length && <tr><td colSpan="3">No referrals yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {page === 'withdraw' && (
            <>
              <h1>Withdraw funds</h1>
              <div className="grid">
                <div className="card">
                  <Wallet className="bigicon" />
                  <p>Available balance</p>
                  <div className="stat">{money(balance)}</div>
                  <p className="small">Minimum withdrawal: {money(MINIMUM_WITHDRAWAL)}</p>
                </div>
                <div className="card">
                  <h2>Withdrawal request</h2>
                  <form onSubmit={requestWithdrawal}>
                    <label>Amount (USDT)</label>
                    <input type="number" min="10" step="0.01" required value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} />
                    <label>BEP20 wallet address</label>
                    <input required value={withdrawWallet} onChange={e => setWithdrawWallet(e.target.value)} placeholder="0x..." />
                    <p className="small">One request per day. Network: {NETWORK}.</p>
                    <button disabled={busy || balance < MINIMUM_WITHDRAWAL}>Submit withdrawal</button>
                  </form>
                </div>
              </div>

              <div className="card">
                <h2>Withdrawal history</h2>
                <div className="tablewrap">
                  <table className="table">
                    <thead><tr><th>Amount</th><th>Wallet</th><th>Status</th><th>Date</th><th>Hash</th></tr></thead>
                    <tbody>
                      {withdrawals.map(item => (
                        <tr key={item.id}>
                          <td>{money(item.amount)}</td>
                          <td style={{ overflowWrap: 'anywhere' }}>{item.wallet_address}</td>
                          <td>{item.status}</td>
                          <td>{new Date(item.created_at).toLocaleDateString()}</td>
                          <td>{item.transaction_hash || '—'}</td>
                        </tr>
                      ))}
                      {!withdrawals.length && <tr><td colSpan="5">No withdrawal requests yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {page === 'admin' && (
            isAdmin ? (
              <>
                <div className="row" style={{ marginTop: 25 }}>
                  <div><h1>GOLDEN Admin</h1><p>Administration and payment management</p></div>
                  <span className="pill"><ShieldCheck size={13} /> ADMIN</span>
                </div>

                <div className="grid">
                  <div className="card"><Users className="bigicon" /><p>Total members</p><div className="stat">{members.length}</div></div>
                  <div className="card"><CreditCard className="bigicon" /><p>Pending deposits</p><div className="stat">{deposits.filter(item => item.status === 'pending').length}</div></div>
                  <div className="card"><Wallet className="bigicon" /><p>Pending withdrawals</p><div className="stat">{adminWithdrawals.filter(item => item.status === 'pending').length}</div></div>
                </div>

                <div className="card">
                  <div className="row"><h2>Deposit submissions</h2><button className="secondary" onClick={loadAdminData}><RefreshCw size={14} /> Refresh</button></div>
                  <div className="tablewrap">
                    <table className="table">
                      <thead><tr><th>Member</th><th>Amount</th><th>Plan</th><th>Hash</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {deposits.map(item => (
                          <tr key={item.id}>
                            <td>{item.profiles?.full_name || item.user_id}</td>
                            <td>{money(item.amount)}</td>
                            <td>{item.memberships?.plan_id || '—'}</td>
                            <td style={{ overflowWrap: 'anywhere' }}>{item.transaction_hash || '—'}</td>
                            <td>{item.status}</td>
                            <td>
                              {item.status === 'pending' && (
                                <div className="actions">
                                  <button disabled={busy} onClick={() => reviewDeposit(item.id, 'approve')}>Approve</button>
                                  <button className="danger" disabled={busy} onClick={() => reviewDeposit(item.id, 'reject')}>Reject</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                        {!deposits.length && <tr><td colSpan="6">No deposits found.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card">
                  <div className="row"><h2>Withdrawal requests</h2><button className="secondary" onClick={loadAdminData}><RefreshCw size={14} /> Refresh</button></div>
                  <div className="tablewrap">
                    <table className="table">
                      <thead><tr><th>Member</th><th>Amount</th><th>Wallet</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {adminWithdrawals.map(item => (
                          <tr key={item.id}>
                            <td>{item.profiles?.full_name || item.user_id}</td>
                            <td>{money(item.amount)}</td>
                            <td style={{ overflowWrap: 'anywhere' }}>{item.wallet_address}</td>
                            <td>{item.status}</td>
                            <td>
                              <div className="actions">
                                {item.status === 'pending' && (
                                  <>
                                    <button disabled={busy} onClick={() => reviewWithdrawal(item.id, 'approve')}>Approve</button>
                                    <button className="danger" disabled={busy} onClick={() => reviewWithdrawal(item.id, 'reject')}>Reject</button>
                                  </>
                                )}
                                {item.status === 'approved' && (
                                  <>
                                    <button disabled={busy} onClick={() => reviewWithdrawal(item.id, 'paid')}>Mark paid</button>
                                    <button className="danger" disabled={busy} onClick={() => reviewWithdrawal(item.id, 'reject')}>Reject & refund</button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!adminWithdrawals.length && <tr><td colSpan="5">No withdrawal requests found.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card">
                  <h2>Registered members</h2>
                  <div className="tablewrap">
                    <table className="table">
                      <thead><tr><th>Name</th><th>Email</th><th>Username</th><th>Joined</th></tr></thead>
                      <tbody>
                        {members.map(member => (
                          <tr key={member.id}>
                            <td>{member.full_name}</td>
                            <td>{member.email}</td>
                            <td>{member.username}</td>
                            <td>{new Date(member.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                        {!members.length && <tr><td colSpan="4">No members found.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="error">You are not authorised to access this page.</div>
            )
          )}

          <footer className="center" style={{ marginTop: 45, borderTop: '1px solid #33270e', paddingTop: 20 }}>
            <div className="brand" style={{ fontSize: 18 }}>GOLDEN</div>
            <p className="small">Member rewards and account management</p>
            <p className="small">Payments and withdrawals use USDT BEP20.</p>
          </footer>
        </div>
      </div>
    </>
  )
}

export default App
