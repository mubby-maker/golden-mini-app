import { useState } from 'react'

const plans = [
  { id: 'starter', name: 'GOLDEN STARTER', price: 1, daily: 1, days: 30 },
  { id: 'premium', name: 'GOLDEN PREMIUM', price: 5, daily: 7, days: 15 }
]

export default function App() {
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [page, setPage] = useState('home')

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand"><span>♛</span> GOLDEN</div>
        <div className="badge">MEMBER ACCESS</div>
      </header>

      <section className="hero">
        <div className="crown">♛</div>
        <p className="eyebrow">WELCOME TO</p>
        <h1>GOLDEN</h1>
        <p className="subtitle">Your rewards. Your community. Your journey.</p>
      </section>

      <section className="notice">
        <strong>Choose your membership plan</strong>
        <p>Select a plan to continue with registration and payment.</p>
      </section>

      <section className="plans">
        {plans.map(plan => (
          <button
            key={plan.id}
            className={`plan ${selectedPlan?.id === plan.id ? 'selected' : ''}`}
            onClick={() => setSelectedPlan(plan)}
          >
            <span className="plan-name">{plan.name}</span>
            <span className="price">${plan.price.toFixed(2)}</span>
            <span className="daily">${plan.daily.toFixed(2)} daily reward</span>
            <span className="duration">{plan.days} days</span>
            <span className="choose">
              {selectedPlan?.id === plan.id ? '✓ SELECTED' : 'SELECT PLAN'}
            </span>
          </button>
        ))}
      </section>

      {selectedPlan && (
        <section className="selected-summary">
          <p>Selected: <strong>{selectedPlan.name}</strong></p>
          <p>Registration: <strong>${selectedPlan.price.toFixed(2)}</strong></p>
          <p>Daily reward: <strong>${selectedPlan.daily.toFixed(2)}</strong></p>
          <p>Duration: <strong>{selectedPlan.days} days</strong></p>
          <button className="primary" onClick={() => setPage('register')}>
            CONTINUE TO REGISTRATION
          </button>
        </section>
      )}

      {page === 'register' && selectedPlan && (
        <section className="registration">
          <h2>Create your GOLDEN account</h2>
          <p>Plan: {selectedPlan.name}</p>
          <input placeholder="Full name" />
          <input placeholder="Username" />
          <input type="email" placeholder="Email address" />
          <input type="password" placeholder="Create password" />
          <button className="primary" onClick={() => alert('Registration will be connected to secure account services next.')}>
            CONTINUE
          </button>
          <button className="back" onClick={() => setPage('home')}>Back to plans</button>
        </section>
      )}

      <footer>GOLDEN © 2026 · Rewards and community platform</footer>
    </main>
  )
}
