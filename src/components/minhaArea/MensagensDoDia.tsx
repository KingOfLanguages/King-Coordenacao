import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { MessageCircle, Check, Copy, Lock, Mail, Loader2, ChevronDown } from 'lucide-react'
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

// ─────────────────────────────────────────────────────────────────────────────
// Mensagens do dia — a lista diária de convites para a reunião de
// acompanhamento (meta ~20 por coordenador, com a régua de pendências do King
// na frente). Era a aba "Mensagens do dia" de Tarefas; desde 2026-09 é o bloco
// do topo da lista Para fazer da Minha Área. Mesmas regras e mesma mensagem;
// o layout virou linhas, e o bloco se recolhe sozinho quando a lista acaba.
// ─────────────────────────────────────────────────────────────────────────────

export function MensagensDoDia() {
  const { profile } = useAuth()
  const isRealAdmin = profile?.role === 'admin' || profile?.is_admin === true
  const canSeeAll = isRealAdmin || profile?.is_lider === true

  const { data: coordenadores = [] } = useCoordenadores()
  const [sel, setSel] = useState('')
  // Abre na própria lista; admin que não coordena grupo cai no primeiro coordenador.
  const souCoordenador = coordenadores.some(c => c.id === profile?.id)
  const coordId = canSeeAll
    ? (sel || (souCoordenador ? profile?.id : coordenadores[0]?.id) || '')
    : (profile?.id ?? '')
  const coordNome = coordenadores.find(c => c.id === coordId)?.nome ?? profile?.nome ?? '—'
  // A RPC/RLS só libera a própria lista (ou admin de verdade).
  const podeVerLista = coordId === profile?.id || isRealAdmin

  const { mapa: nomesPorId } = useNomesPorPerfilId()
  const linkAgendamento = linkAgendamentoPublico()
  const { data: contatos = [], isLoading } = useContatosHoje(podeVerLista ? (coordId || null) : null)
  const marcar = useMarcarContato()
  const enviarConvite = useEnviarConvite()
  const [copiadoId, setCopiadoId] = useState<string | null>(null)
  const [enviandoId, setEnviandoId] = useState<string | null>(null)
  // null = segue o automático (aberto enquanto falta enviar).
  const [abertoManual, setAbertoManual] = useState<boolean | null>(null)

  const enviados = contatos.filter(c => c.enviado).length
  const total = contatos.length
  const bloqueadas = contatos.filter(c => c.origem !== 'normal' && !c.enviado).length
  const pct = total > 0 ? Math.round((enviados / total) * 100) : 0
  const completo = total > 0 && enviados >= total
  const aberto = abertoManual ?? !completo

  // Pendentes em cima (bloqueadas primeiro, na ordem da RPC); enviadas no fim.
  const ordenados = [...contatos].sort((a, b) => Number(a.enviado) - Number(b.enviado))

  function toggle(c: ContatoDia) {
    marcar.mutate({ id: c.id, enviado: !c.enviado }, { onError: () => toast.error('Erro ao atualizar contato.') })
  }
  // Quem assina: o coordenador do grupo do professor; sem grupo, o da lista.
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

  // Envia por e-mail o mesmo texto do WhatsApp; o servidor já marca como enviada.
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

  return (
    <section className="card-surface overflow-hidden" aria-label="Mensagens do dia">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setAbertoManual(!aberto)}
          aria-expanded={aberto}
          className="btn-press flex min-w-[210px] flex-1 items-center gap-2.5 text-left"
        >
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accentBlue-soft text-accentBlue">
            {completo ? <Check className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold text-ink">Mensagens do dia</span>
            <span className="block text-[12px] text-ink-muted">
              {isLoading ? 'Carregando…'
                : total === 0 ? 'Nenhum professor a contatar hoje.'
                  : <>
                      <span className={cn('font-medium tabular-nums', completo ? 'text-urg-lowFg' : 'text-ink-secondary')}>
                        {enviados} de {total}
                      </span>{' '}enviadas
                      {bloqueadas > 0 && <> · <span className="font-medium text-urg-highFg">{bloqueadas} com agenda bloqueada</span></>}
                    </>}
            </span>
          </span>
          <ChevronDown className={cn('ml-auto h-4 w-4 flex-shrink-0 text-ink-muted transition-transform', aberto && 'rotate-180')} />
        </button>
        {canSeeAll && coordenadores.length > 0 && (
          <Select value={coordId} onValueChange={setSel}>
            <SelectTrigger className="h-8 w-full text-[12px] bg-surface-canvas border-line text-ink sm:w-[170px]" aria-label="Lista de qual coordenador">
              <SelectValue placeholder="Coordenador" />
            </SelectTrigger>
            <SelectContent>
              {coordenadores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {total > 0 && (
        <div className="h-1 bg-surface-muted">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, background: completo ? 'var(--urg-low-fg)' : 'var(--accent-blue)' }}
          />
        </div>
      )}

      {aberto && (
        !podeVerLista ? (
          <p className="border-t border-line-soft px-4 py-5 text-center text-[12.5px] text-ink-muted">
            Você só vê a sua própria lista de contatos.
          </p>
        ) : total > 0 && (
          <ul className="divide-y divide-line-soft border-t border-line-soft">
            {ordenados.map(c => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2">
                <button
                  type="button"
                  onClick={() => toggle(c)}
                  disabled={marcar.isPending}
                  title={c.enviado ? 'Desfazer envio' : 'Marcar como enviada'}
                  aria-label={c.enviado ? 'Desfazer envio' : 'Marcar como enviada'}
                  className={cn(
                    'btn-press flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50',
                    c.enviado ? 'border-urg-lowFg bg-urg-lowFg text-white' : 'border-line hover:border-urg-lowFg',
                  )}
                >
                  {c.enviado && <Check className="h-3 w-3" />}
                </button>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Link
                    to={`/professores/${c.professor_id}`}
                    className={cn(
                      'truncate text-[13px] hover:text-accentBlue hover:underline',
                      c.enviado ? 'text-ink-muted line-through' : 'font-medium text-ink',
                    )}
                  >
                    {c.professor?.nome ?? 'Professor removido'}
                  </Link>
                  {c.origem !== 'normal' && c.estagio && !c.enviado && (
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium', ESTAGIO[c.estagio].chip)}>
                      <Lock className="h-2.5 w-2.5" />
                      {ESTAGIO[c.estagio].titulo}
                      {c.dias_bloqueio != null && ` · há ${c.dias_bloqueio}d`}
                    </span>
                  )}
                </div>
                {!c.enviado && (
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copiar(c)}
                      title="Copiar a mensagem (WhatsApp)"
                      className="btn-press inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-[11.5px] font-medium text-ink-secondary hover:text-ink"
                    >
                      {copiadoId === c.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      <span className="hidden sm:inline">{copiadoId === c.id ? 'Copiado' : 'Copiar'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => enviarEmail(c)}
                      disabled={!c.professor?.email || enviandoId === c.id}
                      title={c.professor?.email ? `Enviar por e-mail para ${c.professor.email}` : 'Professor sem e-mail cadastrado'}
                      aria-label="Enviar por e-mail"
                      className="btn-press flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink-secondary hover:text-ink disabled:opacity-40"
                    >
                      {enviandoId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  )
}
