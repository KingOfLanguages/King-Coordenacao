/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card:        { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        popover:     { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
        primary:     { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary:   { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        muted:       { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent:      { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)' },
        border:      'var(--border)',
        input:       'var(--input)',
        ring:        'var(--ring)',
        king: {
          red:    '#C41230',
          dark:   '#0d0d0d',
          card:   '#1a1a1a',
          border: '#2a2a2a',
        },
      },
      fontFamily: {
        sans: ['Sora', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}