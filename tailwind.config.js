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
          critFg: 'var(--urg-crit-fg)', critBg: 'var(--urg-crit-bg)',
        },
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
        tightest: '-0.04em',
        tighter:  '-0.02em',
        label:    '0.08em',
      },

      boxShadow: {
        /* Semantic */
        card:     '0 1px 3px 0 rgba(0, 0, 0, 0.04)',
        elevated: '0 4px 14px -4px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
        popover:  '0 12px 32px -8px rgba(0, 0, 0, 0.14), 0 4px 12px -4px rgba(0, 0, 0, 0.06)',
        focusRing:'0 0 0 3px var(--accent-blue-soft)',

        /* Glass pill nav */
        'pill':    '0 2px 24px -4px rgba(0, 0, 0, 0.09), inset 0 1px 0 rgba(255,255,255,0.9)',
        'pill-dark':'0 2px 24px -4px rgba(0, 0, 0, 0.50), inset 0 1px 0 rgba(255,255,255,0.05)',

        /* Double-bezel card */
        'bezel':  '0 4px 20px -4px rgba(0, 0, 0, 0.07), inset 0 1px 0 rgba(255,255,255,0.9)',
        'bezel-dark': '0 4px 20px -4px rgba(0, 0, 0, 0.40), inset 0 1px 0 rgba(255,255,255,0.04)',

        /* Inner highlight */
        'inner-top': 'inset 0 1px 0 rgba(255,255,255,0.8)',
        'inner-top-dark': 'inset 0 1px 0 rgba(255,255,255,0.05)',
      },

      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-right': {
          '0%':   { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-nav': {
          '0%':   { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'spring-in': {
          '0%':   { opacity: '0', transform: 'scale(0.95) translateY(10px)' },
          '65%':  { opacity: '1', transform: 'scale(1.01) translateY(-2px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'float-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)', filter: 'blur(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)',   filter: 'blur(0px)' },
        },
      },

      animation: {
        'fade-up':        'fade-up 280ms cubic-bezier(0.32,0.72,0,1)',
        'fade-in':        'fade-in 220ms cubic-bezier(0.32,0.72,0,1)',
        'slide-in-right': 'slide-in-right 280ms cubic-bezier(0.32,0.72,0,1)',
        'slide-nav':      'slide-nav 420ms cubic-bezier(0.32,0.72,0,1) forwards',
        'spring-in':      'spring-in 600ms cubic-bezier(0.32,0.72,0,1)',
        'float-up':       'float-up 700ms cubic-bezier(0.32,0.72,0,1)',
      },

      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
        'spring-snappy': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
}
