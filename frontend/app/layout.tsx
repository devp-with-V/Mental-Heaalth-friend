import type { Metadata } from 'next'
import { Noto_Serif, Inter, Public_Sans } from 'next/font/google'
import { AuthProvider } from '@/context/AuthContext'
import './globals.css'

const notoSerif = Noto_Serif({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-noto-serif',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
})

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-public-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Mind Mate | Your Digital Sanctuary',
  description:
    'Mind Mate is a curated therapeutic companion that pairs advanced emotional intelligence with the timeless wisdom of narrative psychology.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body
        className={`${notoSerif.variable} ${inter.variable} ${publicSans.variable} bg-background text-on-background antialiased overflow-x-hidden`}
        style={{ fontFamily: 'var(--font-inter), sans-serif' }}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
