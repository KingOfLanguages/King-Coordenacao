import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Check, Undo2, Copy, Lock, User, Mail, Loader2 } from 'lucide-react'
import {
  useContatosHoje, useMarcarContato, useEnviarConvite, coordenadorResponsavelDe, type ContatoDia,
} from '@/hooks/useContatosDia'
import { useNomesPorPerfilId } from '@/hooks/usePerfisPublicos'
import { useCoordenadores } from '@/hooks/useAcompanhamento'
import { montarMensagemContato, montarAssuntoContato } from '@/lib/mensagemContato'
import { linkAgendamentoPublico } from '@/lib/portal'
import { ESTAGIO } from '@/lib/centralPendencias'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

// ─────────────────────────────────────────────────────────────────────────────
// Mensagens do dia (formato de tarefa) — a lista diária de agendamento de reunião
// de acompanhamento por coordenador, migrada da tela Reuniões do Dia pra cá. Mesmas
// regras (meta ~20/dia, reação à Central de Pendências, mensagem pronta com o link
// do portal /agendar, checklist de "enviada"); só muda o layout pra board de cards.
// ─────────────────────────────────────────────────────────────────────────────

export function MensagensDoDiaBoard() {
  const { profile } = useAuth()
  const isRealAdmin = profile?.role === 'admin' || profile?.is_admin === true
  const podeVerContatos = profile?.role === 'admin' || profile?.role === 'coordenacao'
  const canSeeAll = isRealAdmin || profile?.is_lider === true

  const { data: coordenadores = [] } = useCoordenadores()
  const [sel, setSel] = useState('')
  const coordId = canSeeAll ? (sel || coordenadores[0]?.id || '') : (profile?.id ?? '')
  const coordNome = canSeeAll
    ? (coordenadores.find(c => c.id === coordId)?.nome ?? '—')
    : (profile?.nome ?? '—')
  // A RPC/RLS só libera a própria lista (ou admin de verdade) — evita erro pra
  // líder navegando a lista de outro coordenador.
  const podeVerMinhaLista = coordId === profile?.id || isRealAdmin

  const { mapa: nomesPorId } = useNomesPorPerfilId()
  const linkAgendamento = linkAgendamentoPublico()
  const { data: contatos = [], isLoading } = useContatosHoje(
    podeVerContatos && podeVerMinhaLista ? (coordId || null) : null,
  )
  const marcar = useMarcarContato()
  const enviarConvite = useEnviarConvite()
  const [copiadoId, setCopiadoId] = useState<string | null>(null)
  const [enviandoId, setEnviandoId] = useState<string | null>(null)

  const enviados   = contatos.filter(c => c.enviado).length
  const total      = contatos.length
  const bloqueadas = contatos.filter(c => c.origem !== 'normal').length
  const pct        = total > 0 ? Math.round((enviados / total) * 100) : 0
  const completo   = total > 0 && enviados >= total

  function toggle(c: ContatoDia) {
    marcar.mutate({ id: c.id, enviado: !c.enviado }, { onError: () => toast.error('Erro ao atualizar contato.') })
  }
  // Coordenador que assina — o do grupo do professor; cai pro selecionado se sem grupo.
  function coordDe(c: ContatoDia): string {
    const respId = coordenadorResponsavelDe(c)
    return (respId && nomesPorId.get(respId)) || coordNome
  }

  async function copiar(c: ContatoDia) {
    await navigator.clipboard.writeText(montarMensagemContato(c, coordDe(c), linkAgendamento))
    setCopiadoId(c.id)
    toast.success('Mensagem copiada.')
    setTimeout(() => setCopiadoId(prev => (prev === c.id ? null : prev)), 1800)
  }

  // Envia por e-mail o mesmo texto (idêntico ao do WhatsApp), formatado no servidor.
  async function enviarEmail(c: ContatoDia) {
    const coord = coordDe(c)
    setEnviandoId(c.id)
    try {
      const { para } = await enviarConvite.mutateAsync({
        contato_id:     c.id,
        corpo:          montarMensagemContato(c, coord, linkAgendamento, 'email'),
        assunto:        montarAssuntoContato(c),
        remetente_nome: coord,
      })
      toast.success(`E-mail enviado para ${para || c.professor?.nome || 'o professor'}.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar e-mail.')
    } finally {
      setEnviandoId(null)
    }
  }

  if (!podeVerContatos) {
    return (
      <div className="card-surface p-8 text-center text-[13px] text-ink-muted">
        As mensagens do dia ficam disponíveis para coordenação e admin.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accentBlue-soft text-accentBlue">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[14px] font-semibold text-ink">Mensagens do dia</p>
            <p className="text-[12px] text-ink-muted">
              Meta de {total || 20} contatos ·{' '}
              <span className={cn('font-medium', completo ? 'text-urg-lowFg' : 'text-ink-secondary')}>
                {enviados} enviada{enviados === 1 ? '' : 's'}
              </span>
              {bloqueadas > 0 && <> · <span className="text-urg-highFg font-medium">{bloqueadas} bloqueada{bloqueadas === 1 ? '' : 's'}</span></>}
            </p>
          </div>
        </div>
        {canSeeAll && coordenadores.length > 0 && (
          <Select value={coordId} onValueChange={setSel}>
            <SelectTrigger className="h-9 w-[180px] text-[12px] bg-surface-canvas border-line text-ink">
              <SelectValue placeholder="Coordenador" />
            </SelectTrigger>
            <SelectContent>
              {coordenadores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: completo ? 'var(--urg-low-fg)' : 'var(--accent-blue)' }}
        />
      </div>

      {!podeVerMinhaLista ? (
        <div className="card-surface p-8 text-center text-[13px] text-ink-muted">
          Você só vê a sua própria lista de contatos.
        </div>
      ) : isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-surface-subtle animate-pulse" />)}
        </div>
      ) : total === 0 ? (
        <div className="card-surface p-10 text-center space-y-1">
          <Check className="mx-auto h-6 w-6 text-urg-lowFg" />
          <p className="text-[13px] text-ink-secondary font-medium">Nenhum professor a contatar hoje.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {contatos.map(c => (
            <div key={c.id} className={cn('card-surface p-3.5 space-y-2.5', c.enviado && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <p className={cn('text-[13.5px] font-medium leading-snug min-w-0', c.enviado ? 'text-ink-muted line-through' : 'text-ink')}>
                  {c.professor?.nome ?? 'Professor removido'}
                </p>
                <Link to={`/professores/${c.professor_id}`} title="Ver perfil" className="btn-press flex-shrink-0 text-ink-subtle hover:text-ink">
                  <User className="h-3.5 w-3.5" />
                </Link>
              </div>
              {c.origem !== 'normal' && c.estagio && (
                <span className={cn('inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium', ESTAGIO[c.estagio].chip)}>
                  <Lock className="h-2.5 w-2.5" />
                  {ESTAGIO[c.estagio].titulo}
                  {c.dias_bloqueio != null && ` · há ${c.dias_bloqueio}d`}
                </span>
              )}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => copiar(c)}
                  className="btn-press inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line bg-surface-canvas px-2.5 py-1.5 text-[11.5px] font-medium text-ink-secondary hover:text-ink"
                >
                  {copiadoId === c.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiadoId === c.id ? 'Copiado' : 'Copiar mensagem'}
                </button>
                <button
                  onClick={() => enviarEmail(c)}
                  disabled={!c.professor?.email || enviandoId === c.id}
                  title={c.professor?.email
                    ? `Enviar por e-mail para ${c.professor.email}`
                    : 'Professor sem e-mail cadastrado'}
                  className="btn-press flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-line text-ink-secondary hover:text-ink disabled:opacity-40"
                >
                  {enviandoId === c.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Mail className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => toggle(c)}
                  disabled={marcar.isPending}
                  title={c.enviado ? 'Desfazer envio' : 'Marcar como enviada'}
                  className={cn(
                    'btn-press flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md disabled:opacity-50',
                    c.enviado ? 'border border-line text-ink-secondary' : 'bg-urg-lowFg text-white hover:opacity-90',
                  )}
                >
                  {c.enviado ? <Undo2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
