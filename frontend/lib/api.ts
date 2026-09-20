import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// Automatically attach JWT token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      if (typeof window !== 'undefined') {
        const refresh = localStorage.getItem('refresh_token')
        if (refresh) {
          try {
            const { data } = await axios.post('/api/auth/refresh', {
              refresh_token: refresh,
            })
            localStorage.setItem('access_token', data.access_token)
            localStorage.setItem('refresh_token', data.refresh_token)
            original.headers.Authorization = `Bearer ${data.access_token}`
            return api(original)
          } catch {
            localStorage.clear()
            window.location.href = '/?login=true'
          }
        }
      }
    }
    return Promise.reject(error)
  }
)

// ─── Auth ──────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: object) => api.post('/auth/register', data),
  login: (data: object) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateMe: (data: object) => api.patch('/auth/me', data),
}

// ─── Chat ──────────────────────────────────────────────────────────────
export const chatApi = {
  listConversations: (personaSlug: string | null = null) => {
    const params = personaSlug ? { persona_slug: personaSlug } : {}
    return api.get('/chat/conversations', { params })
  },
  getHistory: (id: number) => api.get(`/chat/history/${id}`),
  deleteConversation: (id: number) => api.delete(`/chat/conversations/${id}`),
  send: (data: object) => api.post('/chat/send', data),

  /**
   * Secure SSE stream using fetch() instead of native EventSource.
   * fetch() allows sending the Authorization header which EventSource cannot.
   * We proactively refresh the access token before opening the stream so that
   * an expired token doesn't cause a 401 mid-stream.
   */
  stream: async function* (
    content: string,
    personaSlug = 'riya',
    conversationId: number | null = null
  ) {
    // ── Step 1: Proactively refresh token if needed ────────────────────────
    let token: string | null = null
    if (typeof window !== 'undefined') {
      token = localStorage.getItem('access_token')
      const refresh = localStorage.getItem('refresh_token')

      // Try to refresh if we have a refresh token (catches expiry before stream opens)
      if (refresh) {
        try {
          const { data } = await axios.post('/api/auth/refresh', { refresh_token: refresh })
          localStorage.setItem('access_token', data.access_token)
          localStorage.setItem('refresh_token', data.refresh_token)
          token = data.access_token
        } catch {
          // Refresh failed — use existing token, will 401 below if truly expired
        }
      }
    }

    // ── Step 2: Open SSE stream with fresh token ───────────────────────────
    const params = new URLSearchParams({ content, persona_slug: personaSlug })
    if (conversationId) params.set('conversation_id', String(conversationId))

    const response = await fetch(`/api/chat/stream?${params}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })

    if (!response.ok) {
      if (response.status === 401) {
        // Token is truly dead — send user to login
        localStorage.clear()
        window.location.href = '/?login=true'
        return
      }
      const body = await response.json().catch(() => ({}))
      throw new Error((body as { detail?: string }).detail || `HTTP ${response.status}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            yield JSON.parse(line.slice(6))
          } catch {
            // skip malformed event
          }
        }
      }
    }
  },
}

// ─── Companions ─────────────────────────────────────────────────────────
export const companionsApi = {
  list: () => api.get('/companions'),
  get: (slug: string) => api.get(`/companions/${slug}`),
  conversations: (slug: string) => api.get(`/companions/${slug}/conversations`),
}

// ─── Mood ──────────────────────────────────────────────────────────────
export const moodApi = {
  log: (data: object) => api.post('/mood/log', data),
  history: (limit = 30) => api.get(`/mood/history?limit=${limit}`),
  suggestions: (score: number) => api.get(`/mood/suggestions?score=${score}`),
}

export default api
