/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* shadcn tokens */
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card:        { DEFAULT: 'var(--card)',        foreground: 'var(--card-foreground)' },
        popover:     { DEFAULT: 'var(--popover)',     foreground: 'var(--popover-foreground)' },
        primary:     { DEFAULT: 'var(--primary)',     foreground: 'var(--primary-foreground)' },
        secondary:   { DEFAULT: 'var(--secondary)',   foreground: 'var(--secondary-foreground)' },
        muted:       { DEFAULT: 'var(--muted)',       foreground: 'var(--muted-foreground)' },
        accent:      { DEFAULT: 'var(--accent)',      foreground: 'var(--accent-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)' },
        border:      'var(--border)',
        input:       'var(--input)',
        ring:        'var(--ring)',

        /* Semantic palette */
        surface: {
          app:      'var(--bg-app)',
          canvas:   'var(--bg-canvas)',
          elevated: 'var(--bg-elevated)',
          subtle:   'var(--bg-subtle)',
          muted:    'var(--bg-muted)',
          inverse:  'var(--bg-inverse)',
        },
        ink: {
          DEFAULT:   'var(--fg-primary)',
          secondary: 'var(--fg-secondary)',
          muted:     'var(--fg-muted)',
          subtle:    'var(--fg-subtle)',
          inverse:   'var(--fg-inverse)',
        },
        line: {
          soft:    'var(--border-soft)',
          DEFAULT: 'var(--border-default)',
          strong:  'var(--border-strong)',
        },
        brand: {
          DEFAULT: 'var(--brand-red)',
          soft:    'var(--brand-red-soft)',
          strong:  'var(--brand-red-strong)',
        },
        accentBlue: {
          DEFAULT: 'var(--accent-blue)',
          soft:    'var(--accent-blue-soft)',
          hov:     'var(--accent-blue-hov)',
        },
        urg: {
          lowFg:  'var(--urg-low-fg)',  lowBg:  'var(--urg-low-bg)',
          medFg:  'var(--urg-med-fg)',  medBg:  'var(--urg-med-bg)',
          highFg: 'var(--urg-high-fg)', highBg: 'var(--urg-high-bg)',
        },

        /* Legacy alias — repointed to light theme so untouched pages stay usable */
        king: {
          red:    'var(--brand-red)',
          dark:   'var(--bg-app)',
          card:   'var(--bg-canvas)',
          border: 'var(--border-default)',
        },
      },
      fontFamily: {
        sans:    ['Geist', 'system-ui', 'sans-serif'],
        mono:    ['"Geist Mono"', 'JetBrains Mono', 'monospace'],
        display: ['Geist', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.03em',
        label:    '0.08em',
      },
      boxShadow: {
        card:     '0 1px 2px 0 rgba(23, 25, 31, 0.04)',
        elevated: '0 4px 14px -4px rgba(23, 25, 31, 0.08), 0 2px 4px -2px rgba(23, 25, 31, 0.04)',
        popover:  '0 12px 32px -8px rgba(23, 25, 31, 0.14), 0 4px 12px -4px rgba(23, 25, 31, 0.06)',
        focusRing: '0 0 0 3px var(--accent-blue-soft)',
      },
      keyframes: {
        'fade-up':   { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        'fade-in':   { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'slide-in-right': { '0%': { opacity: 0, transform: 'translateX(12px)' }, '100%': { opacity: 1, transform: 'translateX(0)' } },
      },
      animation: {
        'fade-up':        'fade-up 220ms cubic-bezier(.2,.8,.2,1)',
        'fade-in':        'fade-in 180ms ease-out',
        'slide-in-right': 'slide-in-right 240ms cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [],
}
