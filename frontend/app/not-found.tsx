import { redirect } from 'next/navigation'

// Catch-all: redirect unknown routes to home
export default function NotFound() {
  redirect('/')
}
