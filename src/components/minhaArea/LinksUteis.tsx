import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeftRight, CalendarDays, Check, Copy, ExternalLink, GraduationCap, Link2, PauseCircle, Plus, Trash2,
  type LucideIcon,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import {
  linkAgendamentoPublico, linkPausaPublico, linkTransferenciaPublico, linkWelcomePathPublico,
} from '@/lib/portal'
import { useLinksUteis, useAdicionarLink, useRemoverLink, normalizarUrl } from '@/hooks/useLinksUteis'

// ─────────────────────────────────────────────────────────────────────────────
// Links úteis — o bloco do topo da coluna lateral da Minha Área, igual para todo
// mundo. Primeiro os portais públicos da plataforma (os links que se mandam
// para o professor), depois os externos que a equipe cadastra — como o
// formulário de desligamento do KMS. Portal público novo entra na lista abaixo.
// ─────────────────────────────────────────────────────────────────────────────

const PORTAIS: { titulo: string; sub: string; url: string; icone: LucideIcon }[] = [
  { titulo: 'Agendar reunião',         sub: 'O professor marca a reunião',       url: linkAgendamentoPublico(),   icone: CalendarDays },
  { titulo: 'Pedir pausa',             sub: 'O professor oficializa a pausa',    url: linkPausaPublico(),         icone: PauseCircle },
  { titulo: 'Transferência de aluno',  sub: 'O professor pede a transferência',  url: linkTransferenciaPublico(), icone: ArrowLeftRight },
  { titulo: 'Welcome Path',            sub: 'Trilha de onboarding do professor', url: linkWelcomePathPublico(),   icone: GraduationCap },
]

function dominio(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export function LinksUteis() {
  const { profile } = useAuth()
  const podeGerir = canEdit(profile)
  const { data: externos = [] } = useLinksUteis()
  const remover = useRemoverLink()
  const [adicionando, setAdicionando] = useState(false)

  async function handleRemover(id: string, titulo: string) {
    if (!window.confirm(`Remover "${titulo}" dos links úteis? Some para todo mundo.`)) return
    try {
      await remover.mutateAsync(id)
      toast.success('Link removido.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao remover o link.')
    }
  }

  return (
    <section className="space-y-3" aria-label="Links úteis">
      <div className="flex items-center justify-between gap-2">
        <h2 className="label-micro flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" />Links úteis</h2>
        {podeGerir && !adicionando && (
          <button
            type="button"
            onClick={() => setAdicionando(true)}
            className="btn-press inline-flex items-center gap-1 text-[11.5px] font-medium text-accentBlue hover:underline"
          >
            <Plus className="h-3 w-3" />Adicionar
          </button>
        )}
      </div>

      <ul className="card-surface divide-y divide-line-soft">
        {PORTAIS.map(p => (
          <LinhaLink key={p.url} titulo={p.titulo} sub={p.sub} url={p.url} icone={p.icone} />
        ))}
        {externos.map(l => (
          <LinhaLink
            key={l.id}
            titulo={l.titulo}
            sub={dominio(l.url)}
            url={l.url}
            icone={ExternalLink}
            externo
            onRemover={podeGerir ? () => handleRemover(l.id, l.titulo) : undefined}
          />
        ))}
      </ul>

      {adicionando && <NovoLink onFechar={() => setAdicionando(false)} />}
    </section>
  )
}

function LinhaLink({ titulo, sub, url, icone: Icone, externo = false, onRemover }: {
  titulo: string
  sub: string
  url: string
  icone: LucideIcon
  externo?: boolean
  onRemover?: () => void
}) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      toast.success('Link copiado.')
      setTimeout(() => setCopiado(false), 1800)
    } catch {
      toast.error('Não consegui copiar. Copie manualmente.')
    }
  }

  return (
    <li className="group flex items-center gap-2.5 px-3 py-2">
      <span
        className={cn(
          'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md',
          externo ? 'bg-surface-subtle text-ink-secondary' : 'bg-accentBlue-soft text-accentBlue',
        )}
      >
        <Icone className="h-3.5 w-3.5" />
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        className="min-w-0 flex-1"
      >
        <span className="block truncate text-[12.5px] font-medium text-ink group-hover:text-accentBlue">{titulo}</span>
        <span className="block truncate text-[11px] text-ink-muted">{sub}</span>
      </a>
      <button
        type="button"
        onClick={copiar}
        title="Copiar link"
        aria-label={`Copiar o link de ${titulo}`}
        className={cn(
          'btn-press flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors',
          copiado ? 'text-urg-lowFg' : 'text-ink-muted hover:bg-surface-subtle hover:text-ink',
        )}
      >
        {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      {onRemover && (
        <button
          type="button"
          onClick={onRemover}
          title="Remover link"
          aria-label={`Remover ${titulo}`}
          className="btn-press -ml-1.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-ink-subtle hover:bg-urg-highBg hover:text-urg-highFg"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  )
}

function NovoLink({ onFechar }: { onFechar: () => void }) {
  const adicionar = useAdicionarLink()
  const [titulo, setTitulo] = useState('')
  const [url, setUrl] = useState('')
  const urlOk = normalizarUrl(url)
  const urlInvalida = url.trim().length > 0 && !urlOk

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!titulo.trim() || !urlOk) return
    try {
      await adicionar.mutateAsync({ titulo, url: urlOk })
      toast.success('Link adicionado — já aparece para todo mundo.')
      onFechar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao adicionar o link.')
    }
  }

  return (
    <form onSubmit={salvar} className="card-surface space-y-2 p-2.5">
      <Input
        autoFocus
        value={titulo}
        onChange={e => setTitulo(e.target.value)}
        maxLength={80}
        placeholder="Nome do link"
        aria-label="Nome do link"
        className="h-8 border-line bg-surface-canvas text-[12.5px]"
      />
      <Input
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://…"
        aria-label="Endereço do link"
        aria-invalid={urlInvalida}
        className="h-8 border-line bg-surface-canvas text-[12.5px]"
      />
      {urlInvalida && <p className="text-[11px] text-urg-highFg">Endereço inválido — use um link http ou https.</p>}
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" onClick={onFechar} className="h-7 text-[12px]">
          Cancelar
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!titulo.trim() || !urlOk || adicionar.isPending}
          className="btn-press h-7 bg-accentBlue text-[12px] text-white hover:bg-accentBlue-hov"
        >
          {adicionar.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </form>
  )
}
