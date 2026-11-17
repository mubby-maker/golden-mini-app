import { useState } from 'react'
import { supabase } from './supabase'

const PAYMENT_WALLET = '0xF8354B188fAC6B6341273641de4F014921F82032'

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
  const [transactionHash, setTransactionHash] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedPlan = plans[plan]

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

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password
        })

      if (loginError) throw loginError

      setPage('payment')
      setMessage('Account created. Complete your payment below.')
    } catch (error) {
      setMessage(error.message || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  async function submitPayment(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (
        PAYMENT_WALLET.includes('PASTE_YOUR') ||
        !PAYMENT_WALLET.trim()
      ) {
        throw new Error('The payment wallet has not been configured yet.')
      }

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
      setMessage('Your payment submission has been received.')
    } catch (error) {
      setMessage(error.message || 'Payment submission failed.')
    } finally {
      setLoading(false)
    }
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

          <button
            className="primary"
            onClick={() => setPage('register')}
          >
            Continue
          </button>
        </>
      )}

      {page === 'register' && (
        <section className="registration">
          <h2>Create your GOLDEN account</h2>

          <form onSubmit={register}>
            <input
              name="fullName"
              placeholder="Full name"
              value={form.fullName}
              onChange={updateForm}
              required
            />

            <input
              name="username"
              placeholder="Username"
              value={form.username}
              onChange={updateForm}
              required
            />

            <input
              name="email"
              type="email"
              placeholder="Email address"
              value={form.email}
              onChange={updateForm}
              required
            />

            <input
              name="password"
              type="password"
              placeholder="Password (minimum 10 characters)"
              value={form.password}
              onChange={updateForm}
              minLength={10}
              required
            />

            <input
              name="referralCode"
              placeholder="Referral code (optional)"
              value={form.referralCode}
              onChange={updateForm}
            />

            <button className="primary" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <button className="back" onClick={() => setPage('home')}>
            Back
          </button>
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

          <form onSubmit={submitPayment}>
            <input
              value={transactionHash}
              onChange={(event) =>
                setTransactionHash(event.target.value)
              }
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
          <p>
            Your payment is awaiting admin verification. Your membership
            will activate after approval.
          </p>
        </section>
      )}

      {message && <p role="status">{message}</p>}

      <footer>
        <p>GOLDEN • Powered by Mubby</p>
      </footer>
    </main>
  )
}
