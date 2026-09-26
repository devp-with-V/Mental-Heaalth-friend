'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useAuth } from '@/context/AuthContext'
import { moodApi } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'

interface MoodLog {
  id: number
  mood_score: number
  emotion_tag?: string
  created_at: string
}

interface ChartEntry extends MoodLog {
  date: string
  value: number
}

const MOOD_LABEL = (s: number) => {
  if (s <= 3) return { label: 'Rough', color: '#c98a94' }
  if (s <= 5) return { label: 'Okay', color: '#c9a26b' }
  if (s <= 7) return { label: 'Good', color: '#9db89a' }
  return { label: 'Great', color: '#8f7aa8' }
}

const CustomDot = (props: { cx?: number; cy?: number; payload?: MoodLog }) => {
  const { cx, cy, payload } = props
  if (!payload) return null
  const { color } = MOOD_LABEL(payload.mood_score)
  return <circle cx={cx} cy={cy} r={5} fill={color} stroke="none" />
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: ChartEntry }>
}) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const { label, color } = MOOD_LABEL(d.mood_score)
  return (
    <div className="bg-sanctuary-panel-2 border border-white/10 rounded-xl p-3 shadow-lg text-sm">
      <div style={{ color, fontWeight: 600 }}>
        {label} · {d.mood_score}/10
      </div>
      {d.emotion_tag && (
        <div className="text-white/50 text-xs">{d.emotion_tag}</div>
      )}
      <div className="text-white/30 text-xs mt-1">
        {new Date(d.created_at).toLocaleDateString()}
      </div>
    </div>
  )
}

// Activity heatmap in the sage ritual scale
function ConsistencyHeatmap({ count }: { count: number }) {
  const colors = [
    'bg-white/[0.05]',
    'bg-sanctuary-sage/20',
    'bg-sanctuary-sage/40',
    'bg-sanctuary-sage/60',
    'bg-sanctuary-sage',
  ]
  const cells = Array.from({ length: 35 }).map((_, i) => ({
    key: i,
    color: count > 0 && i < count ? colors[Math.min(Math.floor(i / 7), 4)] : colors[0],
  }))
  return (
    <div className="grid grid-cols-7 gap-2 w-full">
      {cells.map((c) => (
        <div key={c.key} className={`aspect-square rounded-sm ${c.color}`} />
      ))}
    </div>
  )
}

function ProfileContent() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    moodApi
      .history(30)
      .then(({ data }) => setMoodLogs([...data].reverse()))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const avgMood = moodLogs.length
    ? (moodLogs.reduce((a, m) => a + m.mood_score, 0) / moodLogs.length).toFixed(1)
    : '—'

  const { label: avgLabel, color: avgColor } = moodLogs.length
    ? MOOD_LABEL(parseFloat(avgMood))
    : { label: '—', color: 'var(--color-text-muted)' }

  const chartData: ChartEntry[] = moodLogs.map((m) => ({
    ...m,
    date: new Date(m.created_at).toLocaleDateString('en', {
      month: 'short',
      day: 'numeric',
    }),
    value: m.mood_score,
  }))

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  return (
    <div className="bg-sanctuary-ground text-sanctuary-ink min-h-screen flex flex-col">
      {/* Header */}
      <header className="w-full top-0 sticky z-50 bg-sanctuary-ground/85 backdrop-blur-md border-b border-white/[0.06] transition-colors duration-300">
        <div className="flex justify-between items-center px-8 py-4 max-w-7xl mx-auto w-full">
          <div
            className="font-headline text-2xl font-bold text-sanctuary-terra cursor-pointer"
            onClick={() => router.push('/chat')}
          >
            Mind Mate
          </div>
          <nav className="hidden md:flex items-center space-x-10">
            <button
              onClick={() => router.push('/chat')}
              className="font-label text-sm uppercase tracking-wider text-white/45 hover:text-white/80 transition-colors"
            >
              ← Back to Chat
            </button>
          </nav>
          <div className="flex items-center space-x-6">
            <button
              onClick={handleLogout}
              className="font-label text-sm uppercase tracking-wider text-white/45 hover:text-white/80 transition-colors"
            >
              Sign Out
            </button>
            <button
              onClick={() => router.push('/chat')}
              className="bg-sanctuary-terra text-[#1d1410] px-5 py-2 rounded-full font-label text-sm uppercase tracking-wider font-bold transition-all hover:brightness-110 active:scale-95"
            >
              Open Chat
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow w-full max-w-7xl mx-auto px-8 py-12">
        {/* Profile Header */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-end mb-20">
          <div className="lg:col-span-4">
            <div className="aspect-square w-full max-w-[320px] rounded-3xl overflow-hidden shadow-2xl bg-sanctuary-mauve/10 border border-white/[0.07] flex items-center justify-center">
              <span className="font-headline text-9xl text-sanctuary-mauve">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
          </div>
          <div className="lg:col-span-8">
            <div className="flex items-center gap-4 mb-4">
              <span className="bg-sanctuary-sage/10 border border-sanctuary-sage/30 text-sanctuary-sage px-3 py-1 rounded-full font-label text-xs uppercase tracking-widest font-bold">
                Member
              </span>
              <span className="text-white/30 font-label text-xs uppercase tracking-widest">
                {user?.email}
              </span>
            </div>
            <h1 className="font-headline text-5xl md:text-7xl mb-6 text-sanctuary-ink leading-tight">
              {user?.name}
            </h1>
            <p className="font-headline text-xl text-white/45 max-w-2xl leading-relaxed italic">
              &quot;Tending the inner weather, one evening at a time.&quot;
            </p>
            <div className="flex gap-8 mt-10">
              <div>
                <div className="font-headline text-3xl text-sanctuary-terra font-bold">{moodLogs.length}</div>
                <div className="font-label text-xs uppercase tracking-widest text-white/30">
                  Check-ins
                </div>
              </div>
              <div className="border-l border-white/10" />
              <div>
                <div className="font-headline text-3xl text-sanctuary-terra font-bold">{avgMood}</div>
                <div className="font-label text-xs uppercase tracking-widest text-white/30">
                  Avg Mood (30d)
                </div>
              </div>
              <div className="border-l border-white/10" />
              <div>
                <div className="font-headline text-3xl font-bold" style={{ color: avgColor }}>
                  {avgLabel}
                </div>
                <div className="font-label text-xs uppercase tracking-widest text-white/30">
                  Mood Level
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Bento Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {/* Active Persona */}
          <div className="md:col-span-2 bg-sanctuary-panel border border-white/[0.07] rounded-3xl p-8 flex flex-col justify-between group transition-all hover:border-white/[0.12] duration-300">
            <div className="flex justify-between items-start mb-12">
              <div>
                <h3 className="font-label text-xs uppercase tracking-widest text-sanctuary-sage font-bold mb-2">
                  Current Active Persona
                </h3>
                <h2 className="font-headline text-4xl text-sanctuary-ink">
                  {user?.persona_name || 'Choose a Companion'}
                </h2>
              </div>
              <div className="w-16 h-16 rounded-2xl bg-sanctuary-mauve/10 border border-sanctuary-mauve/30 flex items-center justify-center text-sanctuary-mauve">
                <span className="material-symbols-outlined text-3xl">psychology</span>
              </div>
            </div>
            <div className="mt-10 flex gap-4">
              <button
                onClick={() => router.push('/chat')}
                className="bg-sanctuary-terra text-[#1d1410] px-6 py-3 rounded-full font-label text-sm uppercase font-bold tracking-wider hover:brightness-110 transition-all"
              >
                Resume Session
              </button>
            </div>
          </div>

          {/* Consistency Heatmap */}
          <div className="bg-sanctuary-panel border border-white/[0.07] rounded-3xl p-8 flex flex-col">
            <h3 className="font-label text-xs uppercase tracking-widest text-white/30 font-bold mb-6">
              Consistency Ritual
            </h3>
            <div className="flex-grow flex items-center justify-center">
              <ConsistencyHeatmap count={moodLogs.length} />
            </div>
            <div className="mt-6 flex justify-between text-[10px] uppercase font-label text-white/30 tracking-tighter">
              <span>Last 5 weeks</span>
              <span>Streak: {moodLogs.length > 0 ? `${Math.min(moodLogs.length, 12)} Days` : '—'}</span>
            </div>
          </div>

          {/* Mood Chart */}
          <div className="bg-sanctuary-panel border border-white/[0.07] rounded-3xl p-8 md:col-span-2">
            <h3 className="font-label text-xs uppercase tracking-widest text-white/30 font-bold mb-6">
              Mood Over Time
            </h3>
            {loading ? (
              <div className="flex items-center justify-center h-40 text-white/30 font-body text-sm">
                Loading...
              </div>
            ) : moodLogs.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-white/45 font-body text-sm text-center">
                No mood data yet. Log your first check-in in the chat! 🌡️
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#9db89a" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#9db89a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(236,229,218,0.06)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'rgba(236,229,218,0.4)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[1, 10]}
                    tick={{ fill: 'rgba(236,229,218,0.4)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#9db89a"
                    strokeWidth={2}
                    fill="url(#moodGrad)"
                    dot={<CustomDot />}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Privacy Card */}
          <div className="bg-sanctuary-panel-2 border border-white/[0.07] rounded-3xl p-8 flex flex-col justify-between">
            <div>
              <h3 className="font-label text-xs uppercase tracking-widest text-sanctuary-ink font-bold mb-4">
                Mind Shield
              </h3>
              <p className="font-body text-sm text-white/45 leading-relaxed">
                Your emotional data is encrypted. You are in total control.
              </p>
            </div>
            <div className="mt-8 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-label text-sanctuary-ink">Data Privacy</span>
                <span className="material-symbols-outlined text-sanctuary-sage">lock</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-label text-sanctuary-ink">Export Data</span>
                <span className="material-symbols-outlined text-sanctuary-sage cursor-pointer hover:scale-110 transition-transform">
                  download
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Recent Check-ins */}
        {moodLogs.length > 0 && (
          <section className="mb-20">
            <div className="flex justify-between items-end mb-10 border-b border-white/10 pb-6">
              <h2 className="font-headline text-3xl">Recent Check-ins</h2>
            </div>
            <div className="space-y-3">
              {[...moodLogs]
                .reverse()
                .slice(0, 10)
                .map((m) => {
                  const { label, color } = MOOD_LABEL(m.mood_score)
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-6 p-4 bg-sanctuary-panel border border-white/[0.06] rounded-2xl hover:border-white/[0.12] transition-colors"
                    >
                      <div
                        className="font-headline text-2xl font-bold w-12 text-right"
                        style={{ color }}
                      >
                        {m.mood_score}
                      </div>
                      <div className="flex-1">
                        <span className="font-label text-sm font-bold" style={{ color }}>
                          {label}
                        </span>
                        {m.emotion_tag && (
                          <span className="ml-2 px-2 py-0.5 bg-sanctuary-mauve/10 border border-sanctuary-mauve/30 text-sanctuary-mauve rounded-full font-label text-xs">
                            {m.emotion_tag}
                          </span>
                        )}
                      </div>
                      <div className="font-label text-xs text-white/30 uppercase tracking-widest">
                        {new Date(m.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  )
                })}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full mt-auto border-t border-white/[0.06]">
        <div className="flex flex-col md:flex-row justify-between items-center px-8 py-10 w-full max-w-7xl mx-auto">
          <div className="flex flex-col items-center md:items-start mb-8 md:mb-0">
            <div className="font-headline text-xl text-sanctuary-ink mb-2">Mind Mate</div>
            <p className="font-body text-sm text-white/30">
              Your digital sanctuary.
            </p>
          </div>
          <nav className="flex flex-wrap justify-center gap-8">
            {['Privacy', 'Terms', 'Support', 'Safety'].map(
              (link) => (
                <a
                  key={link}
                  href="#"
                  className="font-label text-xs uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors"
                >
                  {link}
                </a>
              )
            )}
          </nav>
        </div>
      </footer>
    </div>
  )
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfileContent />
    </AuthGuard>
  )
}
