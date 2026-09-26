'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import AuthGuard from '@/components/AuthGuard'

const GENDER_OPTIONS = [
  { value: 'male', label: '♂ Male' },
  { value: 'female', label: '♀ Female' },
  { value: 'prefer_not_to_say', label: '✦ Prefer not to say' },
]

const inputCls =
  'w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl focus:ring-1 focus:ring-sanctuary-terra focus:border-sanctuary-terra transition-all outline-none text-sanctuary-ink placeholder:text-white/25 text-sm'
const labelCls =
  'font-label text-xs uppercase tracking-widest text-white/45 ml-1'

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
    <div className="w-full max-w-md rounded-3xl modal-shadow overflow-hidden fade-in bg-sanctuary-panel border border-white/10">
      <div className="p-8 md:p-10">
        <div className="flex justify-between items-start mb-8">
          <div className="font-headline text-2xl text-sanctuary-ink font-bold">Mind Mate</div>
          <button className="text-white/40 hover:text-white/70 transition-colors" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="mb-8">
          <h2 className="font-headline text-3xl mb-2 text-sanctuary-ink">Welcome back</h2>
          <p className="font-body text-white/45">Your sanctuary kept your place.</p>
        </div>
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-400/30 text-red-200 text-sm font-body">
            {error}
          </div>
        )}

        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-1">
            <label className={labelCls}>Email Address</label>
            <input
              id="login-email"
              name="email"
              type="email"
              value={form.email}
              onChange={handle}
              required
              className={inputCls}
              placeholder="name@example.com"
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              value={form.password}
              onChange={handle}
              required
              className={inputCls}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sanctuary-terra text-[#1d1410] py-4 rounded-full font-label text-sm uppercase tracking-widest font-bold hover:brightness-110 transition-all active:scale-95 mt-4 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="text-center mt-8 text-white/45 text-sm font-body">
          New to Mind Mate?{' '}
          <button type="button" className="text-sanctuary-terra font-bold hover:underline" onClick={onToggle}>
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
    <div className="w-full max-w-md rounded-3xl modal-shadow overflow-hidden fade-in h-auto max-h-[90vh] overflow-y-auto bg-sanctuary-panel border border-white/10">
      <div className="p-8 md:p-10">
        <div className="flex justify-between items-start mb-8">
          <div className="font-headline text-2xl text-sanctuary-ink font-bold">Mind Mate</div>
          <button className="text-white/40 hover:text-white/70 transition-colors" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="mb-8">
          <h2 className="font-headline text-3xl mb-2 text-sanctuary-ink">Step inside</h2>
          <p className="font-body text-white/45">Your sanctuary is waiting.</p>
        </div>
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-400/30 text-red-200 text-sm font-body">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className={labelCls}>First Name</label>
              <input
                name="firstName"
                type="text"
                value={form.firstName}
                onChange={handle}
                required
                className={inputCls}
                placeholder="Alex"
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Last Name</label>
              <input
                name="lastName"
                type="text"
                value={form.lastName}
                onChange={handle}
                className={inputCls}
                placeholder="Reed"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Email</label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handle}
              required
              className={inputCls}
              placeholder="name@example.com"
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Password</label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handle}
              required
              className={inputCls}
              placeholder="At least 6 characters"
            />
          </div>
          <div className="space-y-2">
            <label className={labelCls}>
              How do you identify?{' '}
              <span className="normal-case tracking-normal text-white/30">
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
                      ? 'bg-sanctuary-terra text-[#1d1410] border-sanctuary-terra font-bold'
                      : 'bg-white/[0.04] border-white/15 text-white/50 hover:border-sanctuary-terra/50'
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
              className="mt-1 rounded border-white/20 accent-[#c98a6b]"
            />
            <p className="text-xs text-white/45 font-body leading-relaxed">
              I agree to the{' '}
              <span className="text-sanctuary-terra underline cursor-pointer">Terms</span> and have read
              the <span className="text-sanctuary-terra underline cursor-pointer">Privacy Policy</span>.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sanctuary-terra text-[#1d1410] py-4 rounded-full font-label text-sm uppercase tracking-widest font-bold hover:brightness-110 transition-all active:scale-95 mt-4 disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        <p className="text-center mt-8 text-white/45 text-sm font-body">
          Already have an account?{' '}
          <button className="text-sanctuary-terra font-bold hover:underline" onClick={onToggle}>
            Sign In
          </button>
        </p>
      </div>
    </div>
  )
}

const COMPANIONS = [
  {
    emoji: '🌸',
    name: 'Riya',
    tag: 'warm · best friend',
    quote: '“Tell me everything. I’m not going anywhere.”',
    pill: 'Validation',
    wash: 'bg-persona-riya/10',
    border: 'border-persona-riya/30',
    text: 'text-persona-riya',
    rotate: '-rotate-6',
    pos: 'left-[3%] top-[130px]',
  },
  {
    emoji: '⚡',
    name: 'Arjun',
    tag: 'steady · grounding',
    quote: '“One thing at a time. Heaviest first.”',
    pill: '12 threads',
    wash: 'bg-persona-arjun/10',
    border: 'border-persona-arjun/30',
    text: 'text-persona-arjun',
    rotate: 'rotate-[5deg]',
    pos: 'right-[3%] top-[80px]',
  },
  {
    emoji: '🦁',
    name: 'Alex',
    tag: 'warm · direct',
    quote: '“Proud of you for showing up.”',
    pill: 'Advice',
    wash: 'bg-persona-alex/10',
    border: 'border-persona-alex/30',
    text: 'text-persona-alex',
    rotate: 'rotate-3',
    pos: 'left-[6%] bottom-[50px]',
  },
  {
    emoji: '🧘',
    name: 'The Guide',
    tag: 'quiet · spacious',
    quote: 'A two-minute breathing room, whenever.',
    pill: 'Breathe',
    wash: 'bg-persona-guide/10',
    border: 'border-persona-guide/30',
    text: 'text-persona-guide',
    rotate: '-rotate-3',
    pos: 'right-[6%] bottom-[100px]',
  },
]

function LandingContent() {
  const searchParams = useSearchParams()
  const [modal, setModal] = useState<'signIn' | 'signUp' | null>(null)
  const phoneRef = useRef<HTMLDivElement>(null)

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
    <div className="relative min-h-screen bg-sanctuary-ground text-sanctuary-ink overflow-x-hidden">
      {/* Sanctuary washes */}
      <div className="absolute -top-40 -left-32 w-[640px] h-[640px] rounded-full blur-[140px] pointer-events-none bg-sanctuary-mauve/10" />
      <div className="absolute top-1/3 -right-40 w-[560px] h-[560px] rounded-full blur-[140px] pointer-events-none bg-sanctuary-terra/[0.07]" />
      <div className="absolute bottom-0 left-1/3 w-[420px] h-[420px] rounded-full blur-[140px] pointer-events-none bg-sanctuary-sage/[0.06]" />

      {/* Nav */}
      <header className="relative z-10">
        <nav className="flex items-center justify-between px-6 md:px-12 py-5 max-w-7xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sanctuary-mauve to-sanctuary-terra flex items-center justify-center">
              <span className="material-symbols-outlined text-[#14101d]" style={{ fontSize: '16px' }}>psychology</span>
            </div>
            <span className="font-headline text-lg font-bold tracking-tight">Mind Mate</span>
          </div>
          <div className="hidden md:flex items-center gap-8 font-label text-[13px] uppercase tracking-[0.14em] text-white/45">
            <span className="text-sanctuary-ink">Sanctuary</span>
            <span>Companions</span>
            <span>Rituals</span>
            <span>Safety</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="font-label text-[13px] uppercase tracking-wider font-semibold text-white/60 hover:text-white/90 transition-colors"
              onClick={() => openModal('signIn')}
            >
              Sign In
            </button>
            <button
              className="bg-sanctuary-mauve text-[#14101d] px-6 py-2.5 rounded-full font-label text-[13px] uppercase tracking-wider font-bold hover:brightness-110 transition-all active:scale-95"
              onClick={() => openModal('signUp')}
            >
              Enter ↓
            </button>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative z-10 text-center px-6 pt-12 md:pt-16">
        <span className="inline-block font-label text-[11px] uppercase tracking-[0.22em] text-sanctuary-sage border border-sanctuary-sage/30 bg-sanctuary-sage/[0.07] rounded-full px-5 py-2 mb-7">
          ✦ &nbsp;A digital sanctuary&nbsp; ✦
        </span>
        <h1 className="font-headline text-5xl md:text-7xl leading-[1.08] max-w-4xl mx-auto">
          Enter your <em className="italic text-sanctuary-terra">sanctuary.</em>
          <br />
          Someone is awake with you.
        </h1>
        <p className="font-body text-lg text-white/50 leading-relaxed max-w-xl mx-auto mt-6">
          Companions who remember you, keep your threads, and sit with you through
          the 2 a.m. hours — warm, unhurried, and entirely yours.
        </p>
        <div className="flex flex-wrap gap-4 justify-center mt-9">
          <button
            className="bg-sanctuary-terra text-[#1d1410] px-10 py-4 rounded-full font-label text-sm uppercase tracking-widest font-bold hover:brightness-110 transition-all active:scale-95 flex items-center gap-2"
            onClick={() => openModal('signUp')}
          >
            Begin tonight
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </button>
          <button
            className="border border-white/15 text-sanctuary-ink px-10 py-4 rounded-full font-label text-sm uppercase tracking-widest hover:border-white/30 transition-all"
            onClick={() => openModal('signIn')}
          >
            Meet the companions
          </button>
        </div>

        {/* Stage: floating cards + phone */}
        <div className="relative max-w-6xl mx-auto mt-6 h-[620px] hidden md:block">
          {COMPANIONS.map((c) => (
            <div
              key={c.name}
              className={`absolute w-[250px] bg-sanctuary-panel border border-white/[0.07] rounded-3xl p-5 text-left shadow-2xl ${c.rotate} ${c.pos}`}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className={`w-9 h-9 rounded-xl ${c.wash} border ${c.border} flex items-center justify-center text-lg`}>
                  {c.emoji}
                </div>
                <div>
                  <div className="font-headline text-[15px]">{c.name}</div>
                  <div className="text-[11px] text-white/35">{c.tag}</div>
                </div>
              </div>
              <p className="font-headline text-[13px] leading-relaxed text-white/55">{c.quote}</p>
              <span className={`inline-block font-label text-[10px] uppercase tracking-[0.14em] rounded-full px-3 py-1 mt-3 border ${c.border} ${c.text}`}>
                {c.pill}
              </span>
            </div>
          ))}

          {/* Phone mockup */}
          <div ref={phoneRef} className="absolute left-1/2 top-[30px] -translate-x-1/2 w-[330px] bg-sanctuary-panel border border-white/10 rounded-[48px] px-4 pt-4 pb-7 shadow-2xl">
            <div className="w-[110px] h-[26px] bg-black/60 rounded-full mx-auto mb-4" />
            <div className="flex items-center gap-2.5 px-1.5 pb-3.5">
              <div className="w-9 h-9 rounded-xl bg-persona-riya/10 border border-persona-riya/30 flex items-center justify-center text-lg">🌸</div>
              <div className="text-left">
                <div className="font-headline text-[15px]">Riya</div>
                <div className="text-[11px] text-sanctuary-sage">● here with you</div>
              </div>
            </div>
            <div className="rounded-2xl rounded-tr-md bg-sanctuary-mauve/20 border border-sanctuary-mauve/30 px-4 py-3 text-[13.5px] leading-relaxed text-left ml-11 mb-2.5">
              can&apos;t sleep. mind won&apos;t stop racing
            </div>
            <div className="rounded-2xl rounded-tl-md bg-sanctuary-panel-2 border border-white/[0.07] px-4 py-3 font-headline text-[13.5px] leading-relaxed text-left">
              Then let&apos;s not fight it. Tell me one thought that&apos;s looping — we&apos;ll hold it together.
              <span className="stream-cursor" />
            </div>
          </div>
        </div>
      </main>

      {/* Rituals strip */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24 grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: 'nightlight', title: '2 a.m. ready', desc: 'Dark-first by design. No glaring whites when the night feels heavy.' },
          { icon: 'history', title: 'Threads that persist', desc: 'Every conversation kept. Reopen any night and it replays exactly.' },
          { icon: 'ecg_heart', title: 'Watched over', desc: 'Crisis language is met with care and real helplines, never silence.' },
        ].map((f) => (
          <div key={f.title} className="bg-sanctuary-panel border border-white/[0.07] rounded-3xl p-8 text-left">
            <span className="material-symbols-outlined text-3xl text-sanctuary-sage mb-5 block">{f.icon}</span>
            <h3 className="font-headline text-xl mb-3">{f.title}</h3>
            <p className="text-white/45 text-[15px] leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="flex flex-col md:flex-row justify-between items-center px-8 py-10 w-full max-w-7xl mx-auto gap-6">
          <div className="text-center md:text-left">
            <div className="font-headline text-lg">Mind Mate</div>
            <p className="font-body text-sm text-white/30 mt-1">Your digital sanctuary.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            {['Privacy', 'Terms', 'Support', 'Safety'].map((link) => (
              <a key={link} href="#" className="text-white/30 hover:text-white/60 font-label text-xs uppercase transition-colors">
                {link}
              </a>
            ))}
          </div>
        </div>
        <p className="text-center pb-6 text-xs text-white/25 font-body px-6">
          Mind Mate is a companion, not a clinician. In crisis: iCALL 9152987821 · Tele-MANAS 14416.
        </p>
      </footer>

      {/* Modal overlay */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          {modal === 'signIn' ? (
            <SignInModal onClose={closeModal} onToggle={toggleModal} />
          ) : (
            <SignUpModal onClose={closeModal} onToggle={toggleModal} />
          )}
        </div>
      )}
    </div>
  )
}

export default function LandingPage() {
  return (
    <AuthGuard publicOnly>
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center bg-sanctuary-ground">
          <span className="material-symbols-outlined text-sanctuary-terra animate-spin text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            autorenew
          </span>
        </div>
      }>
        <LandingContent />
      </Suspense>
    </AuthGuard>
  )
}
