import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NavDropdownItem = { to: string; label: string; exact?: boolean }

export function NavDropdown({
  label,
  items,
  isOpen,
  onToggle,
  registerRef,
}: {
  label: string
  items: NavDropdownItem[]
  isOpen: boolean
  onToggle: () => void
  registerRef: (el: HTMLDivElement | null) => void
}) {
  const { pathname } = useLocation()
  const isActive = items.some(item =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to)
  )

  return (
    <div ref={registerRef} className="relative flex-shrink-0">
      <button
        onClick={onToggle}
        className={cn(
          'btn-press flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium whitespace-nowrap',
          isActive
            ? 'bg-surface-subtle text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
            : 'text-ink-secondary hover:text-ink hover:bg-surface-subtle/60'
        )}
      >
        {label}
        <ChevronDown className={cn('h-3 w-3 transition-transform duration-200', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+10px)] w-52 animate-spring-in overflow-hidden
                        rounded-2xl border border-line-soft bg-surface-canvas
                        shadow-[0_12px_32px_-8px_rgba(0,0,0,0.14),0_4px_12px_-4px_rgba(0,0,0,0.06)]
                        dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.50)]">
          <div className="p-1.5">
            {items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) => cn(
                  'btn-press w-full flex items-center gap-2.5 px-3 py-2 rounded-xl',
                  'text-[12.5px] transition-colors duration-150',
                  isActive
                    ? 'bg-surface-subtle text-ink font-medium'
                    : 'text-ink-secondary hover:bg-brand-soft hover:text-brand-strong'
                )}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
