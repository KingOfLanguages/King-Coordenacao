import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Check, Undo2, User, Copy, Lock } from 'lucide-react'
import {
  useContatosHoje, useMarcarContato, reuniaoUltimaDe, coordenadorResponsavelDe,
  type ContatoDia,
} from '@/hooks/useContatosDia'
import { useNomesPorPerfilId } from '@/hooks/usePerfisPublicos'
import { getDefaultTemplate } from '@/lib/messageTemplates'
import { mensagemDoEstagio, ESTAGIO } from '@/lib/centralPendencias'
import { linkAgendamentoPublico } from '@/lib/portal'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

// ─── Mensagens do dia (meta: 20 contatos/dia por coordenador) ────────────────
// Guia lateral simples na tela Reuniões do dia: lista diária de professores a
// contatar, com a mensagem pronta (assinada pelo coordenador, link do portal
// /agendar) e o checklist de "enviada".

export function MensagensDoDia({ coordId, coordNome }: { coordId: string | null; coordNome: string }) {
  const { data: contatos = [], isLoading } = useContatosHoje(coordId)
  const marcar = useMarcarContato()
  const navigate = useNavigate()
  const [copiadoId, setCopiadoId] = useState<string | null>(null)
  // Quem assina a mensagem é o coordenador do grupo do professor, não
  // necessariamente quem está com a lista aberta (admin/líder navegam agenda dos
  // outros). Nome resolvido pela view perfis_publicos.
  const { mapa: nomesPorId } = useNomesPorPerfilId()

  // Link enviado ao professor para agendar: o portal público da King (/agendar).
  const linkAgendamento = linkAgendamentoPublico()

  const enviados   = contatos.filter(c => c.enviado).length
  const total      = contatos.length
  const bloqueadas = contatos.filter(c => c.origem !== 'normal').length
  const pct        = total > 0 ? Math.round((enviados / total) * 100) : 0
  const completo   = total > 0 && enviados >= total

  function toggle(c: ContatoDia) {
    marcar.mutate(
      { id: c.id, enviado: !c.enviado },
      { onError: () => toast.error('Erro ao atualizar contato.') },
    )
  }

  // Texto da mensagem conforme a proveniência do contato:
  //  • estágio 3 (bloqueada 5+ dias) → mensagem de reunião obrigatória + CTA de agendamento;
  //  • estágio 2 (bloqueada 3–4 dias) → check-in com aviso de regularização;
  //  • normal → check-in padrão.
  function montarMensagem(c: ContatoDia): string {
    const nome = c.professor?.nome ?? 'professor(a)'
    const respId = coordenadorResponsavelDe(c)
    // Cai pro coordenador da lista aberta se o professor estiver sem grupo.
    const coord = (respId && nomesPorId.get(respId)) || coordNome

    if (c.estagio === 3) {
      const primeiro = nome.trim().split(/\s+/)[0] || nome
      const linhas = [`*${coord}*`, '', mensagemDoEstagio(3, primeiro, c.aulas_pendentes ?? 0)]
      if (linkAgendamento) {
        linhas.push('', 'Para agendar a reunião de acompanhamento, é só escolher um horário por aqui:', `🔗 ${linkAgendamento}`)
      }
      return linhas.join('\n')
    }

    const ultima = reuniaoUltimaDe(c)
    return getDefaultTemplate().build({
      professorNome: nome,
      coordenadorNome: coord,
      dataUltimaReuniao: ultima
        ? new Date(ultima).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
        : null,
      linkAgendamento,
      avisoBloqueio: c.estagio === 2,
      aulasPendentes: c.aulas_pendentes,
    })
  }

  async function copiarMensagem(c: ContatoDia) {
    await navigator.clipboard.writeText(montarMensagem(c))
    setCopiadoId(c.id)
    toast.success('Mensagem copiada.')
    setTimeout(() => setCopiadoId(prev => (prev === c.id ? null : prev)), 1800)
  }

  return (
    <aside className="card-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle className="h-4 w-4 text-ink-secondary flex-shrink-0" />
          <h2 className="text-[14px] font-semibold text-ink truncate">Mensagens do dia</h2>
        </div>
        <span className="text-[12px] tabular-nums flex-shrink-0">
          <span className={cn('font-semibold', completo ? 'text-urg-lowFg' : 'text-ink')}>{enviados}</span>
          <span className="text-ink-muted">/{total || 20}</span>
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: completo ? 'var(--urg-low-fg)' : 'var(--accent-blue)' }}
        />
      </div>

      {bloqueadas > 0 && (
        <p className="text-[11px] text-urg-highFg flex items-center gap-1">
          <Lock className="h-3 w-3 flex-shrink-0" />
          {bloqueadas} com agenda bloqueada por pendência
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-surface-subtle animate-pulse" />)}
        </div>
      ) : total === 0 ? (
        <p className="text-[12.5px] text-ink-muted py-2">Nenhum professor a contatar hoje.</p>
      ) : (
        <ul className="space-y-0.5 max-h-[calc(100vh-14rem)] overflow-y-auto -mr-1 pr-1">
          {contatos.map(c => (
            <li
              key={c.id}
              className={cn(
                'rounded-lg px-2 py-2 space-y-1.5 transition-colors',
                c.enviado ? 'opacity-60' : 'hover:bg-surface-subtle/50',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={cn(
                  'text-[12.5px] truncate min-w-0',
                  c.enviado ? 'text-ink-muted line-through' : 'text-ink font-medium',
                )}>
                  {c.professor?.nome ?? 'Professor removido'}
                </p>
                <button
                  onClick={() => navigate(`/professores/${c.professor_id}`)}
                  title="Ver perfil"
                  className="btn-press flex-shrink-0 text-ink-subtle hover:text-ink"
                >
                  <User className="h-3.5 w-3.5" />
                </button>
              </div>
              {c.origem !== 'normal' && c.estagio && (
                <span className={cn(
                  'inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                  ESTAGIO[c.estagio].chip,
                )}>
                  <Lock className="h-2.5 w-2.5" />
                  {ESTAGIO[c.estagio].titulo}
                  {c.dias_bloqueio != null && ` · há ${c.dias_bloqueio}d`}
                </span>
              )}
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copiarMensagem(c)}
                  className="btn-press h-7 text-[11px] gap-1.5 border-line text-ink-secondary flex-1"
                >
                  {copiadoId === c.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiadoId === c.id ? 'Copiado' : 'Copiar'}
                </Button>
                <Button
                  size="sm"
                  variant={c.enviado ? 'outline' : 'default'}
                  disabled={marcar.isPending}
                  onClick={() => toggle(c)}
                  title={c.enviado ? 'Desfazer envio' : 'Marcar como enviada'}
                  className={cn(
                    'btn-press h-7 w-7 p-0 flex-shrink-0',
                    c.enviado
                      ? 'border-line text-ink-secondary'
                      : 'bg-urg-lowFg text-white hover:opacity-90',
                  )}
                >
                  {c.enviado ? <Undo2 className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
