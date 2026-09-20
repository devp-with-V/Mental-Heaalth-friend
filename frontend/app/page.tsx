'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SignInButton, useAuth as useClerkAuth } from '@clerk/nextjs'
import { useAuth } from '@/context/AuthContext'
import AuthGuard from '@/components/AuthGuard'
import axios from 'axios'

function ClerkHybridSync() {
  const clerkAuth = useClerkAuth()
  const { user, loginWithTokens } = useAuth()
  const router = useRouter()
  const syncedRef = useRef(false)

  useEffect(() => {
    if (!clerkAuth.isLoaded || !clerkAuth.isSignedIn) return
    if (user || syncedRef.current) return
    
    syncedRef.current = true
    
    clerkAuth.getToken().then(token => {
      axios.post('/api/auth/clerk-login', { clerk_token: token })
        .then(res => {
          loginWithTokens(res.data.access_token, res.data.refresh_token)
            .then(() => router.push('/chat'))
            .catch(() => {})
        })
        .catch(err => {
          console.error("Clerk sync failed", err)
        })
    }).catch(err => {
      console.error("Failed to get Clerk token", err)
    })
  }, [clerkAuth.isLoaded, clerkAuth.isSignedIn, user, loginWithTokens, router])

  // Show a loading overlay while syncing
  if (clerkAuth.isSignedIn && !user && syncedRef.current) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="text-center">
          <span className="material-symbols-outlined text-primary animate-spin text-5xl mb-4" style={{ fontVariationSettings: "'FILL' 1" }}>
            autorenew
          </span>
          <h2 className="font-headline text-xl text-on-surface">Securing your session...</h2>
        </div>
      </div>
    )
  }

  return null
}


const GENDER_OPTIONS = [
  { value: 'male', label: '♂ Male' },
  { value: 'female', label: '♀ Female' },
  { value: 'prefer_not_to_say', label: '✦ Prefer not to say' },
]

function SignInModal({
  onClose,
  onToggle,
}: {
  onClose: () => void
  onToggle: () => void
}) {
  const { login } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      router.push('/chat')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      setError(axiosErr.response?.data?.detail || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-panel w-full max-w-md rounded-2xl modal-shadow overflow-hidden fade-in">
      <div className="p-8 md:p-12">
        <div className="flex justify-between items-start mb-10">
          <div className="font-headline text-2xl text-primary font-bold">Mind Mate</div>
          <button className="text-outline hover:text-on-surface transition-colors" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="mb-8">
          <h2 className="font-headline text-3xl mb-2">Welcome Back</h2>
          <p className="font-body text-on-surface-variant">Access your curated mental archive.</p>
        </div>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-error-container text-on-error-container text-sm font-body">
            {error}
          </div>
        )}
        
        {/* Clerk Sign In Button */}
        <div className="mb-6">
          <SignInButton mode="modal">
            <button className="w-full flex items-center justify-center gap-3 bg-white border border-outline-variant/30 text-on-surface py-3 rounded-full font-label text-sm uppercase tracking-widest font-bold shadow-sm hover:bg-surface-container-lowest transition-all active:scale-95">
              <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
              Sign in with Google
            </button>
          </SignInButton>
        </div>

        <div className="relative mb-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-outline-variant/30" />
          </div>
          <span className="relative bg-white px-4 text-xs font-label uppercase tracking-widest text-outline">
            or sign in with email
          </span>
        </div>
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-1">
            <label className="font-label text-xs uppercase tracking-widest text-on-surface-variant ml-1">
              Email Address
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              value={form.email}
              onChange={handle}
              required
              className="w-full px-4 py-3 bg-white border border-outline-variant/20 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none"
              placeholder="name@example.com"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="font-label text-xs uppercase tracking-widest text-on-surface-variant ml-1">
                Password
              </label>
            </div>
            <input
              id="login-password"
              name="password"
              type="password"
              value={form.password}
              onChange={handle}
              required
              className="w-full px-4 py-3 bg-white border border-outline-variant/20 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary py-4 rounded-full font-label text-sm uppercase tracking-widest font-bold shadow-lg shadow-primary/10 hover:opacity-90 transition-all active:scale-95 mt-4 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="text-center mt-10 text-on-surface-variant text-sm font-body">
          New to Mind Mate?{' '}
          <button type="button" className="text-primary font-bold hover:underline" onClick={onToggle}>
            Create an account
          </button>
        </p>
      </div>
    </div>
  )
}

function SignUpModal({
  onClose,
  onToggle,
}: {
  onClose: () => void
  onToggle: () => void
}) {
  const { register, login } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    gender: 'prefer_not_to_say',
    agreed: false,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (!form.agreed) {
      setError('Please agree to the Terms and Privacy Policy.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const fullName = `${form.firstName} ${form.lastName}`.trim()
      await register(fullName, form.email, form.password, form.gender)
      await login(form.email, form.password)
      router.push('/chat')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      setError(axiosErr.response?.data?.detail || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-panel w-full max-w-md rounded-2xl modal-shadow overflow-hidden fade-in h-auto max-h-[90vh] overflow-y-auto">
      <div className="p-8 md:p-12">
        <div className="flex justify-between items-start mb-8">
          <div className="font-headline text-2xl text-primary font-bold">Mind Mate</div>
          <button className="text-outline hover:text-on-surface transition-colors" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="mb-8">
          <h2 className="font-headline text-3xl mb-2">Begin Your Journey</h2>
          <p className="font-body text-on-surface-variant">Step into a world of mindful clarity.</p>
        </div>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-error-container text-on-error-container text-sm font-body">
            {error}
          </div>
        )}

        {/* Clerk Sign Up Button */}
        <div className="mb-6">
          <SignInButton mode="modal">
            <button className="w-full flex items-center justify-center gap-3 bg-white border border-outline-variant/30 text-on-surface py-3 rounded-full font-label text-sm uppercase tracking-widest font-bold shadow-sm hover:bg-surface-container-lowest transition-all active:scale-95">
              <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
              Sign up with Google
            </button>
          </SignInButton>
        </div>

        <div className="relative mb-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-outline-variant/30" />
          </div>
          <span className="relative bg-white px-4 text-xs font-label uppercase tracking-widest text-outline">
            or personal email
          </span>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-label text-xs uppercase tracking-widest text-on-surface-variant ml-1">
                First Name
              </label>
              <input
                name="firstName"
                type="text"
                value={form.firstName}
                onChange={handle}
                required
                className="w-full px-4 py-3 bg-white border border-outline-variant/20 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
                placeholder="Alex"
              />
            </div>
            <div className="space-y-1">
              <label className="font-label text-xs uppercase tracking-widest text-on-surface-variant ml-1">
                Last Name
              </label>
              <input
                name="lastName"
                type="text"
                value={form.lastName}
                onChange={handle}
                className="w-full px-4 py-3 bg-white border border-outline-variant/20 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
                placeholder="Reed"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="font-label text-xs uppercase tracking-widest text-on-surface-variant ml-1">
              Email
            </label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handle}
              required
              className="w-full px-4 py-3 bg-white border border-outline-variant/20 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
              placeholder="name@example.com"
            />
          </div>
          <div className="space-y-1">
            <label className="font-label text-xs uppercase tracking-widest text-on-surface-variant ml-1">
              Password
            </label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handle}
              required
              className="w-full px-4 py-3 bg-white border border-outline-variant/20 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
              placeholder="At least 6 characters"
            />
          </div>
          {/* Gender selection */}
          <div className="space-y-2">
            <label className="font-label text-xs uppercase tracking-widest text-on-surface-variant ml-1">
              How do you identify?{' '}
              <span className="text-outline normal-case tracking-normal">
                (helps The Guide feel more relatable)
              </span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {GENDER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, gender: opt.value }))}
                  className={`px-3 py-1.5 rounded-full font-label text-xs border transition-all ${
                    form.gender === opt.value
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-white border-outline-variant/40 text-on-surface-variant hover:border-primary/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-3 mt-2">
            <input
              name="agreed"
              type="checkbox"
              checked={form.agreed}
              onChange={handle}
              className="mt-1 rounded border-outline-variant/50 text-primary focus:ring-primary"
            />
            <p className="text-xs text-on-surface-variant font-body leading-relaxed">
              I agree to the{' '}
              <span className="text-primary underline cursor-pointer">Terms</span> and have read
              the <span className="text-primary underline cursor-pointer">Privacy Policy</span>.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary py-4 rounded-full font-label text-sm uppercase tracking-widest font-bold shadow-lg shadow-primary/10 hover:opacity-90 transition-all active:scale-95 mt-4 disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        <p className="text-center mt-8 text-on-surface-variant text-sm font-body">
          Already have an account?{' '}
          <button className="text-primary font-bold hover:underline" onClick={onToggle}>
            Sign In
          </button>
        </p>
      </div>
    </div>
  )
}

function LandingContent() {
  const searchParams = useSearchParams()
  const [modal, setModal] = useState<'signIn' | 'signUp' | null>(null)

  useEffect(() => {
    if (searchParams.get('login') === 'true') {
      setModal('signIn')
    }
  }, [searchParams])

  const openModal = (type: 'signIn' | 'signUp') => setModal(type)
  const closeModal = () => setModal(null)
  const toggleModal = () =>
    setModal((m) => (m === 'signIn' ? 'signUp' : 'signIn'))

  return (
    <>
      <ClerkHybridSync />
      {/* Header */}
      <header className="w-full top-0 sticky bg-surface z-40 transition-colors duration-300">
        <nav className="flex justify-between items-center px-8 py-4 max-w-7xl mx-auto w-full">
          <div className="font-headline text-2xl font-bold text-primary">Mind Mate</div>
          <div className="hidden md:flex items-center space-x-8">
            {['Personas', 'Stories', 'Science', 'Library'].map((item) => (
              <a
                key={item}
                href="#"
                className="text-on-surface-variant hover:text-primary font-label text-sm uppercase tracking-wider transition-colors"
              >
                {item}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-6">
            <button
              className="text-primary font-label text-sm uppercase tracking-wider font-semibold hover:opacity-80 transition-opacity"
              onClick={() => openModal('signIn')}
            >
              Sign In
            </button>
            <button
              className="bg-primary hover:bg-primary-container text-on-primary px-6 py-2.5 rounded-full font-label text-sm uppercase tracking-wider shadow-sm transition-all active:scale-95"
              onClick={() => openModal('signUp')}
            >
              Get Started
            </button>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative min-h-[921px] flex flex-col items-center justify-center px-6 py-20 text-center">
        {/* Decorative background blurs */}
        <div className="absolute top-1/4 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 -left-24 w-96 h-96 bg-secondary/5 rounded-full blur-[100px] pointer-events-none" />

        <span className="font-label text-xs uppercase tracking-[0.2em] text-tertiary font-semibold mb-6 block">
          An Anthology of Empathy
        </span>
        <h1 className="font-headline text-5xl md:text-7xl max-w-4xl leading-tight mb-8">
          Nurture your narrative with{' '}
          <span className="text-primary italic">scientific</span> clarity.
        </h1>
        <p className="font-body text-xl text-on-surface-variant max-w-2xl mb-12">
          Join thousands of thinkers who use Mind Mate to map their cognitive landscapes through
          premium, scholarly curation.
        </p>
        <div className="flex flex-wrap gap-4 justify-center mb-20">
          <button
            className="bg-primary text-on-primary px-8 py-4 rounded-full font-label text-sm uppercase tracking-widest hover:bg-primary-container transition-all flex items-center gap-2 group"
            onClick={() => openModal('signUp')}
          >
            Begin Your Journey
            <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </button>
          <button className="border-b-2 border-transparent hover:border-primary px-4 py-4 font-label text-sm uppercase tracking-widest text-on-surface transition-all">
            View Methodology
          </button>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl w-full">
          {[
            {
              icon: 'psychology',
              title: 'Deep Personalization',
              desc: 'Our algorithms respect your unique mental architecture, providing insights that evolve as you do.',
            },
            {
              icon: 'menu_book',
              title: 'Scholarly Library',
              desc: 'Access a vast archive of curated mental models, philosophy, and neuroscience simplified for growth.',
            },
            {
              icon: 'verified_user',
              title: 'Ethical Privacy',
              desc: 'Your data remains yours. We prioritize absolute transparency and local-first encryption methods.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-surface-container-low p-10 rounded-xl text-left hover:bg-surface-container transition-colors group"
            >
              <span className="material-symbols-outlined text-4xl text-tertiary mb-6 block">
                {f.icon}
              </span>
              <h3 className="font-headline text-2xl mb-4">{f.title}</h3>
              <p className="text-on-surface-variant leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Personas Section */}
      <section className="py-24 bg-surface-container-low">
        <div className="max-w-7xl mx-auto px-8">
          <div className="mb-20 text-center">
            <h2 className="font-headline text-4xl mb-6">Choose Your Voice</h2>
            <p className="font-body text-on-surface-variant max-w-2xl mx-auto italic">
              Every story requires a different listener. Our AI personas are architected to meet you
              exactly where your mind resides today.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                icon: 'spa',
                name: 'Riya',
                role: 'The Compassionate Listener',
                desc: 'Soft-spoken and nurturing, Riya focuses on validation and emotional safety during heavy moments.',
                bg: 'bg-primary-fixed',
                color: 'text-primary',
              },
              {
                icon: 'psychology',
                name: 'Arjun',
                role: 'The Rational Strategist',
                desc: 'Arjun offers structured cognitive frameworks to help you deconstruct anxiety and find logical paths forward.',
                bg: 'bg-secondary-fixed',
                color: 'text-on-secondary-fixed-variant',
              },
              {
                icon: 'self_improvement',
                name: 'Alex',
                role: 'The Stoic Mentor',
                desc: 'Grounded in ancient philosophy, Alex provides a calm perspective on the things within and outside your control.',
                bg: 'bg-tertiary-fixed-dim',
                color: 'text-on-tertiary-fixed',
              },
              {
                icon: 'auto_awesome',
                name: 'The Guide',
                role: 'The Holistic Sage',
                desc: 'A balanced fusion of all voices, designed for those seeking a broad, integrative approach to mental wellness.',
                bg: 'bg-primary-container',
                color: 'text-on-primary-container',
              },
            ].map((p) => (
              <div
                key={p.name}
                className="group relative bg-surface-container-lowest p-8 rounded-xl transition-all duration-500 hover:-translate-y-2 persona-card"
              >
                <div
                  className={`w-16 h-16 rounded-full ${p.bg} mb-6 flex items-center justify-center ${p.color}`}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {p.icon}
                  </span>
                </div>
                <h3 className="font-headline text-2xl mb-2">{p.name}</h3>
                <p className="font-label text-xs text-tertiary mb-4 uppercase tracking-widest">
                  {p.role}
                </p>
                <p className="font-body text-sm text-on-surface-variant leading-relaxed">{p.desc}</p>
                <div className="mt-8">
                  <button
                    className="text-primary font-label text-xs uppercase tracking-widest hover:underline"
                    onClick={() => openModal('signUp')}
                  >
                    Select Persona
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-32 bg-primary text-on-primary">
        <div className="max-w-7xl mx-auto px-8 flex flex-col items-center text-center space-y-10">
          <h2 className="font-headline text-5xl md:text-6xl max-w-3xl leading-tight">
            Begin your next chapter with clarity.
          </h2>
          <p className="font-body text-xl opacity-90 max-w-xl">
            Join 200,000+ others finding peace in the digital age. Your first sessions are always on
            us.
          </p>
          <button
            className="bg-surface text-primary px-10 py-5 rounded-full font-label text-sm uppercase tracking-widest hover:bg-surface-bright transition-all shadow-lg"
            onClick={() => openModal('signUp')}
          >
            Get Started — It&apos;s Free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-surface-container-lowest">
        <div className="flex flex-col md:flex-row justify-between items-center px-8 py-12 w-full max-w-7xl mx-auto border-t border-outline-variant/10">
          <div className="mb-8 md:mb-0 space-y-4">
            <div className="font-headline text-xl text-on-surface">Mind Mate</div>
            <p className="font-body text-sm text-on-secondary-fixed-variant max-w-xs">
              © 2024 Mind Mate. Your path to mindful clarity.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-8 md:gap-12">
            {['Privacy Policy', 'Terms of Service', 'Contact Support', 'Our Methodology'].map(
              (link) => (
                <a
                  key={link}
                  href="#"
                  className="text-on-secondary-fixed-variant hover:text-primary font-label text-xs uppercase transition-colors"
                >
                  {link}
                </a>
              )
            )}
          </div>
        </div>
        <p className="text-center pb-4 text-xs text-outline font-body">
          Mind Mate is not a replacement for professional mental health care. If you are in crisis,
          please contact a crisis line.
        </p>
      </footer>

      {/* Modal overlay */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/30 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          {modal === 'signIn' ? (
            <SignInModal onClose={closeModal} onToggle={toggleModal} />
          ) : (
            <SignUpModal onClose={closeModal} onToggle={toggleModal} />
          )}
        </div>
      )}
    </>
  )
}

export default function LandingPage() {
  return (
    <AuthGuard publicOnly>
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <span className="material-symbols-outlined text-primary animate-spin text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            autorenew
          </span>
        </div>
      }>
        <LandingContent />
      </Suspense>
    </AuthGuard>
  )
}
