import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './context/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Sanctuary (dusk) system — the single visual language ──
        'sanctuary-ground': '#14101d',
        'sanctuary-panel': '#1d1729',
        'sanctuary-panel-2': '#241c33',
        'sanctuary-ink': '#ece5da',
        'sanctuary-sage': '#9db89a',
        'sanctuary-terra': '#c98a6b',
        'sanctuary-mauve': '#8f7aa8',
        // Blended persona hues (tints/washes only — never neon)
        'persona-riya': '#c98a94',
        'persona-arjun': '#7f96b8',
        'persona-alex': '#c9a26b',
        'persona-guide': '#9a86c2',
        'persona-squad': '#9db89a',
      },
      fontFamily: {
        headline: ['var(--font-noto-serif)', 'serif'],
        display: ['var(--font-noto-serif)', 'serif'],
        body: ['var(--font-inter)', 'sans-serif'],
        label: ['var(--font-public-sans)', 'sans-serif'],
        'label-sm': ['var(--font-public-sans)', 'sans-serif'],
        'headline-lg': ['var(--font-noto-serif)', 'serif'],
        'headline-md': ['var(--font-noto-serif)', 'serif'],
        'headline-sm': ['var(--font-noto-serif)', 'serif'],
        'body-lg': ['var(--font-inter)', 'sans-serif'],
        'body-md': ['var(--font-inter)', 'sans-serif'],
        'body-sm': ['var(--font-inter)', 'sans-serif'],
        'label-md': ['var(--font-public-sans)', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        full: '0.75rem',
        '2xl': '1rem',
      },
      spacing: {
        gutter: '24px',
        'margin-mobile': '20px',
        'margin-desktop': '40px',
        'container-max-width': '1200px',
        'chat-width': '768px',
      },
      maxWidth: {
        'chat-width': '768px',
      },
    },
  },
  plugins: [],
}

export default config
