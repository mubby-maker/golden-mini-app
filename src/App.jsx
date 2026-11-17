import { useState } from 'react'
import { supabase } from './supabase'

const plans = [
  { id: 'starter', name: 'GOLDEN STARTER', price: 1, daily: 1, days: 30 },
  { id: 'premium', name: 'GOLDEN PREMIUM', price: 5, daily: 7, days: 15 }
]

export default function App() {
  const [plan, setPlan] = useState(null)
  const [page, setPage] = useState('home')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    fullName: '', username: '', email: '', password: '', referralCode: ''
  })

  function update(field, value) {
    setForm(old => ({ ...old, [field]: value }))
  }

  async function register(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const initData = window.Telegram?.WebApp?.initData
      if (!initData) throw new Error('Open GOLDEN through the Mubby Telegram bot.')

      const { data, error } = await supabase.functions.invoke('create-account', {
        body: { initData, ...form }
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password
      })

      if (loginError) throw loginError

      setMessage('Account created successfully. Your referral code is ' + data.referralCode)
      setPage('home')
    } catch (error) {
      setMessage(error.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">♛ GOLDEN</div>
        <div className="badge">MEMBER ACCESS</div>
      </header>

      <section className="hero">
        <div className="crown">♛</div>
        <p className="eyebrow">WELCOME TO</p>
        <h1>GOLDEN</h1>
        <p className="subtitle">Your rewards. Your community. Your journey.</p>
      </section>

      {message && <div className="notice" role="status">{message}</div>}

      {page === 'home' && (
        <>
          <section className="notice">
            <strong>Choose your membership plan</strong>
            <p>Select a plan to continue with registration.</p>
          </section>

          <section className="plans">
            {plans.map(item => (
              <button
                key={item.id}
                className={`plan ${plan?.id === item.id ? 'selected' : ''}`}
                onClick={() => setPlan(item)}
              >
                <span className="plan-name">{item.name}</span>
                <span className="price">${item.price.toFixed(2)}</span>
                <span className="daily">${item.daily.toFixed(2)} daily reward</span>
                <span className="duration">{item.days} days</span>
                <span className="choose">
                  {plan?.id === item.id ? '✓ SELECTED' : 'SELECT PLAN'}
                </span>
              </button>
            ))}
          </section>

          {plan && (
            <section className="selected-summary">
              <p>Selected: <strong>{plan.name}</strong></p>
              <p>Registration: <strong>${plan.price.toFixed(2)}</strong></p>
              <button className="primary" onClick={() => setPage('register')}>
                CONTINUE TO REGISTRATION
              </button>
            </section>
          )}
        </>
      )}

      {page === 'register' && (
        <form className="registration" onSubmit={register}>
          <h2>Create your GOLDEN account</h2>
          <p>Selected plan: {plan?.name}</p>

          <input required placeholder="Full name"
            value={form.fullName}
            onChange={e => update('fullName', e.target.value)} />

          <input required placeholder="Username"
            value={form.username}
            onChange={e => update('username', e.target.value)} />

          <input required type="email" placeholder="Email address"
            value={form.email}
            onChange={e => update('email', e.target.value)} />

          <input required type="password" minLength="10"
            placeholder="Create password (10 characters minimum)"
            value={form.password}
            onChange={e => update('password', e.target.value)} />

          <input placeholder="Referral code (optional)"
            value={form.referralCode}
            onChange={e => update('referralCode', e.target.value)} />

          <button className="primary" disabled={loading}>
            {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
          </button>

          <button type="button" className="back" onClick={() => setPage('home')}>
            Back to plans
          </button>
        </form>
      )}

      <footer>GOLDEN © 2026 · Rewards and community platform</footer>
    </main>
  )
}
