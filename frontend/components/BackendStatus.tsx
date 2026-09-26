'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '')
// Static export (`output: 'export'`) has no Next.js rewrites, so a relative
// `/api/health` would hit Vercel itself and 404 — ping the backend directly.
const HEALTH_ENDPOINT = BACKEND_URL ? `${BACKEND_URL}/health` : '/api/health'
const RETRY_INTERVAL_MS = 8000 // Check every 8 seconds
const INITIAL_CHECK_TIMEOUT_MS = 6000 // Timeout for the initial check

/**
 * BackendStatus — a full-screen overlay that appears when the
 * backend (Render free tier, etc.) is asleep or unreachable.
 *
 * It auto-pings `/api/health` on a loop and silently disappears
 * the moment the backend responds with a 2xx.
 */
export default function BackendStatus() {
  const [offline, setOffline] = useState<boolean | null>(null) // null = still checking
  const [dots, setDots] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkHealth = useCallback(async () => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), INITIAL_CHECK_TIMEOUT_MS)
      
      const res = await fetch(HEALTH_ENDPOINT, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      })
      clearTimeout(timeout)

      if (res.ok) {
        setOffline(false)
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      } else {
        setOffline(true)
        setRetryCount((c) => c + 1)
      }
    } catch {
      setOffline(true)
      setRetryCount((c) => c + 1)
    }
  }, [])

  // Initial check + polling loop
  useEffect(() => {
    checkHealth()

    timerRef.current = setInterval(checkHealth, RETRY_INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [checkHealth])

  // Animated dots effect
  useEffect(() => {
    if (!offline) return
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 500)
    return () => clearInterval(id)
  }, [offline])

  // Still doing the initial check — don't flash anything
  if (offline === null) return null

  // Backend is online — render nothing
  if (!offline) return null

  // Estimate Render cold-start time (free tier ~30-50s)
  const estimatedWait = retryCount <= 2
    ? 'This usually takes 30–50 seconds'
    : retryCount <= 5
      ? 'Almost there, hang tight'
      : 'Taking longer than usual — the server may be restarting'

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0a0a1a]">
      {/* Ambient background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-[150px] pointer-events-none" />

      <div className="relative text-center px-6 max-w-md">
        {/* Pulsing icon */}
        <div className="mx-auto mb-8 w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center shadow-2xl shadow-violet-500/10">
          <span
            className="material-symbols-outlined text-sanctuary-mauve animate-pulse"
            style={{ fontSize: '36px', fontVariationSettings: "'FILL' 1" }}
          >
            cloud_sync
          </span>
        </div>

        {/* Heading */}
        <h1 className="font-headline text-2xl md:text-3xl text-white mb-3">
          Waking up the servers{dots}
        </h1>

        {/* Subtext */}
        <p className="font-body text-white/40 text-sm md:text-base mb-8 leading-relaxed">
          Our backend is hosted on a free tier and goes to sleep after inactivity.
          <br />
          {estimatedWait}.
        </p>

        {/* Progress bar */}
        <div className="w-full max-w-xs mx-auto h-1 bg-white/[0.06] rounded-full overflow-hidden mb-6">
          <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full animate-progress" />
        </div>

        {/* Retry count */}
        <p className="font-label text-xs text-white/20 uppercase tracking-widest">
          Health check #{retryCount} • Auto-retrying every {RETRY_INTERVAL_MS / 1000}s
        </p>
      </div>

      {/* CSS animation for the progress bar */}
      <style jsx>{`
        @keyframes progress {
          0% { width: 0%; }
          50% { width: 70%; }
          100% { width: 100%; }
        }
        .animate-progress {
          animation: progress ${RETRY_INTERVAL_MS / 1000}s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
