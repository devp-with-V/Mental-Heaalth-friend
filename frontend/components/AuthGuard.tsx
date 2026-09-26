'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

interface AuthGuardProps {
  children: React.ReactNode
  /** If true, redirect authenticated users to /chat (for login/register pages) */
  publicOnly?: boolean
}

export default function AuthGuard({ children, publicOnly = false }: AuthGuardProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (publicOnly && user) {
      router.replace('/chat')
    } else if (!publicOnly && !user) {
      router.replace('/?login=true')
    }
  }, [user, loading, publicOnly, router])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-sanctuary-ground">
        <div className="flex flex-col items-center gap-4">
          <span
            className="material-symbols-outlined text-sanctuary-terra animate-spin text-5xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            autorenew
          </span>
        </div>
      </div>
    )
  }

  if (publicOnly && user) return null
  if (!publicOnly && !user) return null

  return <>{children}</>
}
