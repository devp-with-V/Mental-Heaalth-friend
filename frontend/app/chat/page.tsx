'use client'

import { useState, useEffect, useRef } from 'react'
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

const COMPANION_ICONS: Record<string, string> = {
  riya: 'face',
  arjun: 'face_2',
  alex: 'face_3',
  guide: 'psychology',
  squad: 'groups',
}

// ─── Mood Check-in Modal ────────────────────────────────────────────────
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-sm rounded-2xl p-8 modal-shadow fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {saved ? (
          <div className="text-center text-on-surface font-headline text-xl py-4">
            ✅ Mood logged! 💙
          </div>
        ) : (
          <>
            <h3 className="font-headline text-2xl text-on-surface mb-6">How are you feeling today?</h3>
            <div className="text-5xl text-center mb-2">{emoji}</div>
            <div className="text-center font-label text-sm text-outline mb-4">{score} / 10</div>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={score}
              onChange={(e) => setScore(parseFloat(e.target.value))}
              className="w-full accent-primary mb-6"
            />
            <div className="flex flex-wrap gap-2 mb-6">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setTag((t) => (t === s ? '' : s))}
                  className={`px-3 py-1 rounded-full font-label text-xs border transition-all ${
                    tag === s
                      ? 'bg-primary text-on-primary border-primary'
                      : 'border-outline-variant/40 text-on-surface-variant hover:border-primary/50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={save}
              className="w-full bg-primary text-on-primary py-3 rounded-full font-label text-sm uppercase tracking-widest mb-3 hover:opacity-90 transition-all"
            >
              Save 💙
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-full font-label text-sm uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-all"
            >
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Quick Action Cards ────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { icon: 'mood', label: 'Check-in', prompt: "Let's do a quick emotional check-in." },
  { icon: 'self_improvement', label: 'Meditate', prompt: 'I need help meditating and calming down.' },
  { icon: 'edit_note', label: 'Journal', prompt: 'I want to journal my thoughts. Can you guide me?' },
  { icon: 'lightbulb', label: 'Advice', prompt: 'I need some practical advice.' },
]

// ─── Main Chat Page ────────────────────────────────────────────────────
function ChatContent() {
  const { user, logout } = useAuth()
  const router = useRouter()

  const [companions, setCompanions] = useState<Companion[]>([])
  const [activeSlug, setActiveSlug] = useState('riya')
  const [activeConvId, setActiveConvId] = useState<number | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
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

  // Load companions
  useEffect(() => {
    companionsApi.list().then(({ data }) => setCompanions(data)).catch(() => {})
  }, [])

  // Fetch conversations list for current companion
  const fetchConversations = (slug = activeSlug) => {
    setLoadingConvs(true)
    chatApi
      .listConversations(slug)
      .then(({ data }) => setConversations(data))
      .catch(() => setConversations([]))
      .finally(() => setLoadingConvs(false))
  }

  // Load old thread history
  const loadConversation = async (convId: number) => {
    if (streaming || convId === activeConvId) return
    setActiveConvId(convId)
    setLoadingHistory(true)
    try {
      const { data } = await chatApi.getHistory(convId)
      setMessages(
        (data.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        }))
      )
    } catch (err) {
      console.error('Failed to load history', err)
    } finally {
      setLoadingHistory(false)
      setSidebarOpen(false)
    }
  }

  // Delete conversation thread
  const deleteConversationThread = async (e: React.MouseEvent, convId: number) => {
    e.stopPropagation()
    try {
      await chatApi.deleteConversation(convId)
      setConversations((prev) => prev.filter((c) => c.id !== convId))
      if (activeConvId === convId) {
        startNewChat()
      }
    } catch (err) {
      console.error('Failed to delete conversation', err)
    }
  }

  // Reset & load conversations on companion switch
  useEffect(() => {
    setActiveConvId(null)
    setMessages([])
    fetchConversations(activeSlug)
  }, [activeSlug])

  // Mood check-in on first daily visit
  useEffect(() => {
    const today = new Date().toDateString()
    const lastMood = sessionStorage.getItem('mood_checked')
    if (lastMood !== today) {
      setTimeout(() => setShowMood(true), 800)
      sessionStorage.setItem('mood_checked', today)
    }
  }, [])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (presetMessage: string | null = null) => {
    const content = (presetMessage || input).trim()
    if (!content || streaming) return
    if (!presetMessage) setInput('')

    const userMsg: Message = {
      id: Date.now(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }
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
          // Refresh threads list after new conversation turn
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  const startNewChat = () => {
    setActiveConvId(null)
    setMessages([])
    inputRef.current?.focus()
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Sidebar ── */}
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-on-surface/20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`flex flex-col h-full w-80 fixed left-0 top-0 bg-surface-container-low p-gutter gap-2 shadow-sm shadow-primary/10 z-50 transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        {/* Logo */}
        <div className="flex flex-col gap-1 mb-6 shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-3xl">psychology</span>
            <h1 className="font-headline text-xl font-bold text-primary">Mind Mate</h1>
          </div>
          <p className="text-on-surface-variant font-label text-xs opacity-70">Your digital sanctuary</p>
        </div>

        {/* New Chat CTA */}
        <button
          onClick={startNewChat}
          className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-primary text-on-primary rounded-xl font-label text-sm transition-all active:scale-95 hover:shadow-lg hover:shadow-primary/20 mb-4 shrink-0"
        >
          <span className="material-symbols-outlined">add</span>
          New Conversation
        </button>

        {/* Personas Section */}
        <div className="flex flex-col gap-2 shrink-0">
          <h2 className="font-label text-xs text-on-surface-variant uppercase tracking-wider mb-1 px-2">
            Personas
          </h2>
          <nav className="flex flex-col gap-1">
            {companions.map((c) => (
              <button
                key={c.slug}
                onClick={() => { setActiveSlug(c.slug); setSidebarOpen(false) }}
                className={`persona-item flex items-center justify-between p-2.5 rounded-lg font-label text-sm transition-all hover:bg-surface-container-high text-left ${
                  activeSlug === c.slug
                    ? 'bg-secondary-container text-on-surface font-bold'
                    : 'text-on-surface-variant'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined">
                    {COMPANION_ICONS[c.slug] || 'face'}
                  </span>
                  <span>{c.display_name}</span>
                </div>
                <span className="material-symbols-outlined chevron-icon text-sm opacity-50">
                  chevron_right
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Recent Threads Section */}
        <div className="flex flex-col gap-2 flex-grow overflow-y-auto min-h-0 border-t border-outline-variant/20 pt-3 mt-2">
          <div className="flex items-center justify-between px-2 mb-1">
            <h2 className="font-label text-xs text-on-surface-variant uppercase tracking-wider">
              Recent Threads
            </h2>
            {loadingConvs && (
              <span className="material-symbols-outlined text-xs animate-spin text-primary">
                progress_activity
              </span>
            )}
          </div>

          {conversations.length === 0 ? (
            <p className="font-label text-xs text-on-surface-variant/60 italic px-2 py-2">
              No saved threads with {activeCompanion?.display_name || 'this companion'}.
            </p>
          ) : (
            <nav className="flex flex-col gap-1 pr-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={`group flex items-center justify-between p-2.5 rounded-lg text-xs font-label transition-all cursor-pointer ${
                    activeConvId === conv.id
                      ? 'bg-primary/10 text-primary font-semibold border border-primary/20'
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate min-w-0 pr-1">
                    <span className="material-symbols-outlined text-sm shrink-0">
                      chat_bubble_outline
                    </span>
                    <span className="truncate">{conv.title}</span>
                  </div>
                  <button
                    onClick={(e) => deleteConversationThread(e, conv.id)}
                    title="Delete conversation"
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-error transition-opacity shrink-0"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              ))}
            </nav>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex flex-col gap-1 pt-3 border-t border-outline-variant/30 shrink-0">
          <button
            onClick={() => router.push('/profile')}
            className="flex items-center gap-3 p-2.5 text-on-surface-variant rounded-lg transition-all hover:bg-surface-container-high font-label text-sm"
          >
            <span className="material-symbols-outlined">person</span>
            <span>Profile</span>
          </button>
          <button
            onClick={() => setShowMood(true)}
            className="flex items-center gap-3 p-2.5 text-on-surface-variant rounded-lg transition-all hover:bg-surface-container-high font-label text-sm"
          >
            <span className="material-symbols-outlined">mood</span>
            <span>Mood Check</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 p-2.5 text-on-surface-variant rounded-lg transition-all hover:bg-surface-container-high font-label text-sm"
          >
            <span className="material-symbols-outlined">logout</span>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Area ── */}
      <main className="flex flex-col h-screen flex-1 md:ml-80 relative bg-background">
        {/* Decorative blobs */}
        <div className="absolute top-1/4 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none z-0" />
        <div className="absolute bottom-1/4 -left-24 w-96 h-96 bg-secondary/5 rounded-full blur-[100px] pointer-events-none z-0" />

        {/* Top bar */}
        <header className="flex justify-between items-center w-full px-5 md:px-10 py-3 bg-background sticky top-0 z-40 border-b border-outline-variant/10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <div className="hidden md:block">
              <h2 className="font-headline text-lg text-on-surface font-semibold">
                Mind Mate Assistant
              </h2>
            </div>
            <div className="md:hidden font-headline text-lg font-bold text-primary">Mind Mate</div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen((prev) => !prev)}
              title="Toggle Thread History"
              className="p-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant"
            >
              <span className="material-symbols-outlined">history</span>
            </button>
            <div className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center font-label text-sm font-bold">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          </div>
        </header>

        {/* Messages / Loading / Empty state */}
        <section className="flex-grow flex flex-col items-center justify-center px-5 md:px-10 overflow-y-auto chat-container z-10">
          {loadingHistory ? (
            <div className="flex flex-col items-center gap-3 text-primary animate-pulse py-12">
              <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
              <p className="font-label text-sm">Loading conversation history...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="max-w-chat-width w-full flex flex-col items-center text-center fade-in py-12">
              <div className="w-24 h-24 mb-8 bg-primary/10 rounded-full flex items-center justify-center">
                <span
                  className="material-symbols-outlined text-primary text-5xl"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  spa
                </span>
              </div>
              <h3 className="font-headline text-3xl md:text-4xl text-on-surface mb-4">
                Hi, I&apos;m here to listen.
              </h3>
              <p className="font-body text-lg text-on-surface-variant max-w-md">
                Which persona would you like to talk to today?
              </p>
              <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => sendMessage(a.prompt)}
                    className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/30 hover:border-primary/30 hover:bg-white transition-all group"
                  >
                    <span
                      className="material-symbols-outlined text-primary mb-2 block group-hover:scale-110 transition-transform"
                    >
                      {a.icon}
                    </span>
                    <span className="font-label text-sm">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-chat-width flex flex-col gap-6 py-8">
              {messages.map((msg, i) =>
                msg.role === 'user' ? (
                  <div key={msg.id || i} className="flex justify-end fade-in">
                    <div className="bg-primary text-on-primary p-4 rounded-3xl rounded-tr-sm max-w-[80%] font-body text-base leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id || i} className="flex items-start gap-4 fade-in">
                    <div className="w-9 h-9 rounded-full bg-secondary-container flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-on-surface text-sm">
                        {COMPANION_ICONS[activeSlug] || 'face'}
                      </span>
                    </div>
                    <div
                      className={`bg-secondary-container/30 text-on-surface p-4 rounded-3xl rounded-tl-sm border border-secondary-container/50 max-w-[80%] font-body text-base leading-relaxed prose-bubble ${
                        msg.streaming ? 'after:content-["▋"] after:animate-pulse after:text-primary' : ''
                      }`}
                    >
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                )
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        {/* Input bar */}
        <footer className="w-full flex justify-center p-gutter bg-gradient-to-t from-background via-background to-transparent sticky bottom-0 z-10">
          <div className="max-w-chat-width w-full relative">
            <div className="relative flex items-center">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${activeCompanion?.display_name || 'Mind Mate'}...`}
                rows={1}
                disabled={streaming}
                className="w-full min-h-[64px] pl-14 pr-20 py-5 bg-white border-none rounded-full shadow-[0_8px_30px_rgb(9,76,178,0.08)] focus:ring-2 focus:ring-primary/20 font-body text-base placeholder:text-on-surface-variant/40 transition-shadow resize-none outline-none leading-6 overflow-hidden disabled:opacity-60"
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height = Math.min(target.scrollHeight, 200) + 'px'
                }}
              />
              <div className="absolute left-4 flex items-center justify-center">
                <button className="p-2 text-on-surface-variant/60 hover:text-primary transition-colors">
                  <span className="material-symbols-outlined">attach_file</span>
                </button>
              </div>
              <div className="absolute right-3 flex items-center gap-2">
                <button className="p-2 text-on-surface-variant/60 hover:text-primary transition-colors">
                  <span className="material-symbols-outlined">mic</span>
                </button>
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || streaming}
                  className="w-10 h-10 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
                >
                  <span className="material-symbols-outlined text-sm">
                    {streaming ? 'more_horiz' : 'arrow_upward'}
                  </span>
                </button>
              </div>
            </div>
            {messages.length === 0 && (
              <div className="mt-4 flex justify-center gap-3">
                {['Tell me a story', 'Help me relax'].map((p) => (
                  <button
                    key={p}
                    onClick={() => sendMessage(p)}
                    className="px-4 py-1.5 bg-surface-container-high/50 text-on-surface-variant/70 font-label text-xs rounded-full border border-outline-variant/20 hover:bg-white cursor-pointer transition-colors"
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
