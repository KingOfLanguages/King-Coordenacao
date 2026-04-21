import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props { className?: string }

export function ThemeToggle({ className }: Props) {
  const { resolvedTheme, setTheme } = useTheme()
  // Avoid hydration mismatch — render after mount
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return <span className="h-8 w-8" />

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      aria-label={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'btn-press inline-flex items-center justify-center h-8 w-8 rounded-md',
        'text-ink-muted hover:text-ink hover:bg-surface-subtle transition-colors',
        className,
      )}
    >
      {isDark
        ? <Sun  className="h-4 w-4" />
        : <Moon className="h-4 w-4" />
      }
    </button>
  )
}
