// ─────────────────────────────────────────────────────────────────────────────
// Identidade visual — logo OFICIAL da King (arquivos da marca em /public).
//
// Antes o app usava um losango vermelho desenhado à mão + a palavra "KING
// CODEX". A plataforma passou a se chamar "Gestão dos Professores" e a marca
// virou a oficial, então tudo que exibe a identidade passa por aqui — header do
// app, login, cadastro, esqueci/redefinir senha.
//
// Dois arquivos do lockup porque o texto é chapado no PNG: o de texto escuro
// some no tema escuro e vice-versa. Trocamos por CSS (`dark:`), sem JS, pra não
// piscar o logo errado na primeira renderização.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils'

/** Nome da plataforma — um lugar só, pra não divergir entre as telas. */
export const NOME_PLATAFORMA = 'Gestão dos Professores'

/** Só a cabeça do leão (marca isolada). Usada onde não cabe o lockup inteiro. */
export function KingMarca({ className }: { className?: string }) {
  return (
    <img
      src="/king-lion.png"
      alt="King of Languages"
      className={cn('h-8 w-8 object-contain', className)}
      draggable={false}
    />
  )
}

/** Lockup completo (leão + "KING OF LANGUAGES"). */
export function KingLockup({ className }: { className?: string }) {
  return (
    <>
      <img
        src="/king-logo.png"
        alt="King of Languages"
        className={cn('h-7 w-auto self-start object-contain object-left dark:hidden', className)}
        draggable={false}
      />
      <img
        src="/king-logo-dark.png"
        alt=""
        aria-hidden
        className={cn('hidden h-7 w-auto self-start object-contain object-left dark:block', className)}
        draggable={false}
      />
    </>
  )
}

/**
 * Assinatura das telas de autenticação: lockup + nome da plataforma.
 * `compact` esconde o texto (header colapsado no mobile).
 */
export function KingBrand({
  className, compact = false,
}: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5 min-w-0', className)}>
      <KingMarca className="h-8 w-8 shrink-0" />
      {!compact && (
        <span className="flex flex-col leading-tight min-w-0">
          <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">
            {NOME_PLATAFORMA}
          </span>
          <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-ink-muted">
            King of Languages
          </span>
        </span>
      )}
    </span>
  )
}
