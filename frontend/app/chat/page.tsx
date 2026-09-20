'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import { useAuth } from '@/context/AuthContext'
import { chatApi, moodApi, companionsApi } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'

interface Companion {
  slug: string
  display_name: string
  avatar_emoji: string
  tagline: string
}

interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
  streaming?: boolean
}

interface ConversationSummary {
  id: number
  title: string
  persona_id?: number
  created_at: string
  updated_at?: string
}

// Per-companion accent colours for dynamic theming
const COMPANION_THEME: Record<string, { accent: string; bg: string; border: string; bubble: string; dot: string }> = {
  riya:  { accent: 'text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-rose-400/30',  bubble: 'bg-rose-500',   dot: 'bg-rose-400'   },
  arjun: { accent: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-400/30',  bubble: 'bg-blue-500',   dot: 'bg-blue-400'   },
  alex:  { accent: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-400/30', bubble: 'bg-amber-500',  dot: 'bg-amber-400'  },
  guide: { accent: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-400/30',bubble: 'bg-violet-500', dot: 'bg-violet-400' },
  squad: { accent: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-400/30',bubble:'bg-emerald-500',dot: 'bg-emerald-400' },
}

const COMPANION_STATUS: Record<string, string> = {
  riya:  'Your warm best friend 🌸',
  arjun: 'Steady guy in your corner ⚡',
  alex:  'Big brother energy 🦁',
  guide: 'Mindful & grounding 🧘',
  squad: 'The whole crew 🫂',
}

// ─── Mood Check-in Modal ─────────────────────────────────────────────────────
function MoodModal({ onClose }: { onClose: () => void }) {
  const [score, setScore] = useState(5)
  const [tag, setTag] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    moodApi.suggestions(score).then((r) => setSuggestions(r.data.suggestions)).catch(() => {})
  }, [score])

  const save = async () => {
    await moodApi.log({ mood_score: score, emotion_tag: tag || undefined })
    setSaved(true)
    setTimeout(onClose, 1200)
  }

  const emoji = score <= 3 ? '😔' : score <= 5 ? '😐' : score <= 7 ? '🙂' : score <= 9 ? '😊' : '🌟'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-8 bg-[#1a1a2e] border border-white/10 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {saved ? (
          <div className="text-center text-white font-headline text-xl py-4">✅ Mood logged! 💙</div>
        ) : (
          <>
            <h3 className="font-headline text-2xl text-white mb-6">How are you feeling?</h3>
            <div className="text-5xl text-center mb-2">{emoji}</div>
            <div className="text-center font-label text-sm text-white/50 mb-4">{score} / 10</div>
            <input type="range" min={1} max={10} step={0.5} value={score}
              onChange={(e) => setScore(parseFloat(e.target.value))}
              className="w-full accent-violet-500 mb-6" />
            <div className="flex flex-wrap gap-2 mb-6">
              {suggestions.map((s) => (
                <button key={s} onClick={() => setTag((t) => (t === s ? '' : s))}
                  className={`px-3 py-1 rounded-full font-label text-xs border transition-all ${
                    tag === s ? 'bg-violet-500 text-white border-violet-500' : 'border-white/20 text-white/60 hover:border-violet-400/50'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
            <button onClick={save} className="w-full bg-violet-500 hover:bg-violet-400 text-white py-3 rounded-full font-label text-sm uppercase tracking-widest mb-3 transition-all">
              Save 💙
            </button>
            <button onClick={onClose} className="w-full py-3 rounded-full font-label text-sm text-white/40 hover:text-white/70 transition-all">
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Quick Action Cards ───────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { icon: 'mood',            label: 'Check-in', prompt: "Let's do a quick emotional check-in." },
  { icon: 'self_improvement',label: 'Meditate', prompt: 'I need help meditating and calming down.' },
  { icon: 'edit_note',       label: 'Journal',  prompt: 'I want to journal my thoughts. Can you guide me?' },
  { icon: 'lightbulb',       label: 'Advice',   prompt: 'I need some practical advice.' },
]

// ─── Main Chat Page ───────────────────────────────────────────────────────────
function ChatContent() {
  const { user, logout } = useAuth()
  const router = useRouter()

  const [companions, setCompanions] = useState<Companion[]>([])
  const [activeSlug, setActiveSlug] = useState('riya')
  const [activeConvId, setActiveConvId] = useState<number | null>(null)
  // Map of slug → conversation list
  const [convMap, setConvMap] = useState<Record<string, ConversationSummary[]>>({})
  const [expandedSlug, setExpandedSlug] = useState<string>('riya')
  const [loadingConvs, setLoadingConvs] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [showMood, setShowMood] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const activeCompanion = companions.find((c) => c.slug === activeSlug) || null
  const theme = COMPANION_THEME[activeSlug] || COMPANION_THEME['riya']
  const conversations = convMap[activeSlug] || []

  // Load companions on mount
  useEffect(() => {
    companionsApi.list().then(({ data }) => setCompanions(data)).catch(() => {})
  }, [])

  // Fetch conversation threads for a given slug
  const fetchConversations = useCallback((slug: string) => {
    setLoadingConvs(true)
    chatApi.listConversations(slug)
      .then(({ data }) => setConvMap((prev) => ({ ...prev, [slug]: data })))
      .catch(() => setConvMap((prev) => ({ ...prev, [slug]: [] })))
      .finally(() => setLoadingConvs(false))
  }, [])

  // Fetch threads for all companions once companions load
  useEffect(() => {
    if (companions.length === 0) return
    companions.forEach((c) => fetchConversations(c.slug))
  }, [companions, fetchConversations])

  // Load message history for a conversation thread
  const loadConversation = async (convId: number, slug: string) => {
    if (streaming || convId === activeConvId) return
    setActiveSlug(slug)
    setExpandedSlug(slug)
    setActiveConvId(convId)
    setLoadingHistory(true)
    try {
      const { data } = await chatApi.getHistory(convId)
      setMessages(
        (data.messages || []).map((m: any) => ({
          id: m.id, role: m.role, content: m.content, created_at: m.created_at,
        }))
      )
    } catch (err) {
      console.error('Failed to load history', err)
    } finally {
      setLoadingHistory(false)
      setSidebarOpen(false)
    }
  }

  // Delete a conversation thread
  const deleteConversation = async (e: React.MouseEvent, convId: number, slug: string) => {
    e.stopPropagation()
    try {
      await chatApi.deleteConversation(convId)
      setConvMap((prev) => ({ ...prev, [slug]: (prev[slug] || []).filter((c) => c.id !== convId) }))
      if (activeConvId === convId) startNewChat()
    } catch (err) {
      console.error('Failed to delete conversation', err)
    }
  }

  // When selecting a persona from sidebar header
  const selectPersona = (slug: string) => {
    if (slug === expandedSlug) {
      setExpandedSlug('')
    } else {
      setExpandedSlug(slug)
    }
    if (slug !== activeSlug) {
      setActiveSlug(slug)
      setActiveConvId(null)
      setMessages([])
    }
  }

  // Mood check-in on first daily visit
  useEffect(() => {
    const today = new Date().toDateString()
    const lastMood = sessionStorage.getItem('mood_checked')
    if (lastMood !== today) {
      setTimeout(() => setShowMood(true), 800)
      sessionStorage.setItem('mood_checked', today)
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (presetMessage: string | null = null) => {
    const content = (presetMessage || input).trim()
    if (!content || streaming) return
    if (!presetMessage) setInput('')

    const userMsg: Message = { id: Date.now(), role: 'user', content, created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])
    setStreaming(true)

    const botMsgId = Date.now() + 1
    setMessages((prev) => [
      ...prev,
      { id: botMsgId, role: 'assistant', content: '', created_at: new Date().toISOString(), streaming: true },
    ])

    try {
      const stream = chatApi.stream(content, activeSlug, activeConvId)
      for await (const data of stream) {
        if (data.done) {
          setStreaming(false)
          if (data.conversation_id && data.conversation_id !== activeConvId) {
            setActiveConvId(data.conversation_id)
          }
          setMessages((prev) => prev.map((m) => (m.id === botMsgId ? { ...m, streaming: false } : m)))
          fetchConversations(activeSlug)
        } else if (data.token) {
          setMessages((prev) =>
            prev.map((m) => (m.id === botMsgId ? { ...m, content: m.content + data.token } : m))
          )
        }
      }
    } catch {
      setStreaming(false)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId ? { ...m, content: 'Something went wrong. Please try again 💙', streaming: false } : m
        )
      )
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const startNewChat = () => {
    setActiveConvId(null)
    setMessages([])
    inputRef.current?.focus()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d0d1a] text-white">

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ══════════════════════════════════════════
          SIDEBAR
      ══════════════════════════════════════════ */}
      <aside className={`
        flex flex-col h-full w-72 fixed left-0 top-0 z-50
        bg-[#111127] border-r border-white/[0.06]
        transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
      `}>

        {/* Logo */}
        <div className="px-5 pt-6 pb-4 shrink-0">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <span className="material-symbols-outlined text-white text-base" style={{ fontSize: '16px' }}>psychology</span>
            </div>
            <span className="font-headline text-lg font-bold text-white tracking-tight">Mind Mate</span>
          </div>
          <p className="text-white/30 text-xs font-label ml-10">Your digital sanctuary</p>
        </div>

        {/* New Chat Button */}
        <div className="px-3 mb-4 shrink-0">
          <button
            onClick={startNewChat}
            className="flex items-center gap-2 w-full py-2.5 px-4 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] text-white/70 hover:text-white font-label text-sm transition-all group"
          >
            <span className="material-symbols-outlined text-white/50 group-hover:text-white transition-colors" style={{ fontSize: '18px' }}>add</span>
            New Conversation
          </button>
        </div>

        {/* Divider */}
        <div className="mx-4 border-t border-white/[0.06] mb-3 shrink-0" />

        {/* ── Persona List with Nested Threads ── */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 sidebar-scroll">
          <p className="px-3 text-[10px] font-label uppercase tracking-widest text-white/25 mb-2">Companions</p>

          {companions.map((c) => {
            const cTheme = COMPANION_THEME[c.slug] || COMPANION_THEME['riya']
            const cConvs = convMap[c.slug] || []
            const isActive = activeSlug === c.slug
            const isExpanded = expandedSlug === c.slug

            return (
              <div key={c.slug} className="mb-1">
                {/* Persona Row */}
                <button
                  onClick={() => selectPersona(c.slug)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group
                    ${isActive
                      ? `${cTheme.bg} border ${cTheme.border}`
                      : 'hover:bg-white/[0.05] border border-transparent'
                    }
                  `}
                >
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0 ${isActive ? cTheme.bg : 'bg-white/[0.06]'} transition-all`}>
                    {c.avatar_emoji}
                  </div>

                  {/* Name + tagline */}
                  <div className="flex-1 min-w-0">
                    <div className={`font-label text-sm font-medium truncate ${isActive ? 'text-white' : 'text-white/70'}`}>
                      {c.display_name}
                    </div>
                    {cConvs.length > 0 && (
                      <div className="text-[10px] text-white/30 font-label truncate">
                        {cConvs.length} thread{cConvs.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>

                  {/* Active dot */}
                  {isActive && <div className={`w-1.5 h-1.5 rounded-full ${cTheme.dot} shrink-0`} />}

                  {/* Expand chevron */}
                  {cConvs.length > 0 && (
                    <span
                      className={`material-symbols-outlined text-white/20 group-hover:text-white/40 transition-all ${isExpanded ? 'rotate-90' : ''}`}
                      style={{ fontSize: '16px' }}
                    >
                      chevron_right
                    </span>
                  )}
                </button>

                {/* Nested Threads */}
                {isExpanded && cConvs.length > 0 && (
                  <div className="ml-4 mt-0.5 mb-1 pl-3 border-l border-white/[0.07] flex flex-col gap-0.5">
                    {cConvs.map((conv) => (
                      <div
                        key={conv.id}
                        onClick={() => loadConversation(conv.id, c.slug)}
                        className={`
                          group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-all
                          ${activeConvId === conv.id
                            ? `${cTheme.bg} ${cTheme.accent} font-medium`
                            : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                          }
                        `}
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <span className="material-symbols-outlined shrink-0 opacity-50" style={{ fontSize: '13px' }}>chat_bubble_outline</span>
                          <span className="text-xs font-label truncate">{conv.title}</span>
                        </div>
                        <button
                          onClick={(e) => deleteConversation(e, conv.id, c.slug)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-all shrink-0 ml-1"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Divider */}
        <div className="mx-4 border-t border-white/[0.06] shrink-0" />

        {/* Footer Nav */}
        <div className="px-2 py-3 flex flex-col gap-0.5 shrink-0">
          {/* User pill */}
          <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <span className="text-white/50 font-label text-sm truncate">{user?.name || 'User'}</span>
          </div>
          <button onClick={() => router.push('/profile')} className="flex items-center gap-3 px-3 py-2 text-white/40 hover:text-white/70 rounded-lg hover:bg-white/[0.05] font-label text-sm transition-all">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>person</span> Profile
          </button>
          <button onClick={() => setShowMood(true)} className="flex items-center gap-3 px-3 py-2 text-white/40 hover:text-white/70 rounded-lg hover:bg-white/[0.05] font-label text-sm transition-all">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>mood</span> Mood Check
          </button>
          <button onClick={() => { logout(); router.push('/') }} className="flex items-center gap-3 px-3 py-2 text-white/40 hover:text-red-400 rounded-lg hover:bg-red-500/[0.06] font-label text-sm transition-all">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span> Sign out
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════════
          MAIN AREA
      ══════════════════════════════════════════ */}
      <main className="flex flex-col flex-1 h-screen md:ml-72 relative">

        {/* Ambient glow matching active persona */}
        <div className={`absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none opacity-20 ${
          activeSlug === 'riya' ? 'bg-rose-500' :
          activeSlug === 'arjun' ? 'bg-blue-500' :
          activeSlug === 'alex' ? 'bg-amber-500' :
          activeSlug === 'guide' ? 'bg-violet-500' : 'bg-emerald-500'
        }`} />

        {/* ── Dynamic Top Bar ── */}
        <header className="flex items-center justify-between px-5 md:px-8 py-3 border-b border-white/[0.06] bg-[#0d0d1a]/80 backdrop-blur-md sticky top-0 z-40 shrink-0">
          {/* Left: hamburger + companion info */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-all"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>

            {activeCompanion ? (
              <div className="flex items-center gap-3">
                {/* Companion avatar */}
                <div className={`w-9 h-9 rounded-xl ${theme.bg} flex items-center justify-center text-xl border ${theme.border}`}>
                  {activeCompanion.avatar_emoji}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-headline text-base font-semibold text-white leading-none">
                      {activeCompanion.display_name}
                    </h2>
                    {/* Online dot */}
                    <div className={`w-1.5 h-1.5 rounded-full ${theme.dot} animate-pulse`} />
                  </div>
                  <p className={`text-xs font-label mt-0.5 ${theme.accent} opacity-80`}>
                    {COMPANION_STATUS[activeSlug]}
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-9 w-40 rounded-xl bg-white/[0.05] animate-pulse" />
            )}
          </div>

          {/* Right: history + new chat */}
          <div className="flex items-center gap-2">
            <button
              onClick={startNewChat}
              title="New conversation"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white/50 hover:text-white font-label text-xs transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
              <span className="hidden sm:inline">New chat</span>
            </button>
            {loadingConvs && (
              <span className="material-symbols-outlined text-white/30 animate-spin" style={{ fontSize: '18px' }}>progress_activity</span>
            )}
          </div>
        </header>

        {/* ── Messages ── */}
        <section className="flex-1 overflow-y-auto px-5 md:px-10 chat-container">
          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-white/30">
              <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
              <p className="font-label text-sm">Loading conversation...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center fade-in px-4">
              {/* Persona greeting */}
              <div className={`w-20 h-20 mb-6 rounded-2xl ${theme.bg} border ${theme.border} flex items-center justify-center text-5xl shadow-2xl`}>
                {activeCompanion?.avatar_emoji || '🧘'}
              </div>
              <h3 className="font-headline text-3xl text-white mb-2">
                Hey, I&apos;m {activeCompanion?.display_name || 'here'}.
              </h3>
              <p className="font-body text-white/40 text-base max-w-sm mb-12">
                {activeCompanion?.tagline || 'What would you like to talk about today?'}
              </p>
              {/* Quick action grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => sendMessage(a.prompt)}
                    className={`p-4 rounded-2xl border ${theme.border} ${theme.bg} hover:brightness-125 transition-all group text-left`}
                  >
                    <span className={`material-symbols-outlined ${theme.accent} mb-2 block group-hover:scale-110 transition-transform`}>{a.icon}</span>
                    <span className="font-label text-sm text-white/70">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto flex flex-col gap-6 py-8">
              {messages.map((msg, i) =>
                msg.role === 'user' ? (
                  <div key={msg.id || i} className="flex justify-end fade-in">
                    <div className={`${theme.bubble} text-white px-5 py-3.5 rounded-3xl rounded-tr-md max-w-[78%] font-body text-base leading-relaxed shadow-lg`}>
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id || i} className="flex items-start gap-3 fade-in">
                    <div className={`w-8 h-8 rounded-xl ${theme.bg} border ${theme.border} flex items-center justify-center text-base shrink-0 mt-0.5`}>
                      {activeCompanion?.avatar_emoji || '🧘'}
                    </div>
                    <div className={`bg-white/[0.05] border border-white/[0.08] text-white/90 px-5 py-3.5 rounded-3xl rounded-tl-md max-w-[78%] font-body text-base leading-relaxed prose-bubble ${
                      msg.streaming ? 'after:content-["▋"] after:animate-pulse after:text-white/40' : ''
                    }`}>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                )
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        {/* ── Input Bar ── */}
        <footer className="px-5 md:px-10 pb-6 pt-3 bg-gradient-to-t from-[#0d0d1a] via-[#0d0d1a]/95 to-transparent shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2 bg-white/[0.06] border border-white/[0.1] rounded-2xl px-4 py-3 focus-within:border-white/20 transition-all shadow-xl">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${activeCompanion?.display_name || 'Mind Mate'}...`}
                rows={1}
                disabled={streaming}
                className="flex-1 bg-transparent text-white placeholder:text-white/25 font-body text-sm resize-none outline-none leading-6 disabled:opacity-50 max-h-48 overflow-y-auto"
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 192) + 'px'
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || streaming}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                  input.trim() && !streaming
                    ? `${theme.bubble} text-white shadow-lg hover:brightness-110 active:scale-95`
                    : 'bg-white/[0.06] text-white/20 cursor-not-allowed'
                }`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  {streaming ? 'more_horiz' : 'arrow_upward'}
                </span>
              </button>
            </div>

            {/* Suggestion chips — only on empty state */}
            {messages.length === 0 && (
              <div className="mt-3 flex justify-center gap-2 flex-wrap">
                {['Tell me a story 📖', 'Help me relax 🌿', 'I need to vent 💬'].map((p) => (
                  <button
                    key={p}
                    onClick={() => sendMessage(p)}
                    className="px-3.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-white/35 hover:text-white/60 font-label text-xs rounded-full border border-white/[0.07] transition-all"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        </footer>
      </main>

      {showMood && <MoodModal onClose={() => setShowMood(false)} />}
    </div>
  )
}

export default function ChatPage() {
  return (
    <AuthGuard>
      <ChatContent />
    </AuthGuard>
  )
}
