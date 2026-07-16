import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Check, Undo2, User, Copy } from 'lucide-react'
import { useContatosHoje, useMarcarContato, reuniaoUltimaDe, type ContatoDia } from '@/hooks/useContatosDia'
import { getDefaultTemplate } from '@/lib/messageTemplates'
import { linkAgendamentoPublico } from '@/lib/portal'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

// ─── Mensagens do dia (meta: 20 contatos/dia por coordenador) ────────────────
// Lista diária de professores a contatar pelo coordenador. Mora na tela
// Reuniões do dia: cada linha tem a mensagem pronta (assinada pelo coordenador),
// o link pro perfil e o checklist de "enviada".

export function MensagensDoDia({ coordId, coordNome }: { coordId: string | null; coordNome: string }) {
  const { data: contatos = [], isLoading } = useContatosHoje(coordId)
  const marcar = useMarcarContato()
  const navigate = useNavigate()
  const [copiadoId, setCopiadoId] = useState<string | null>(null)

  // Link enviado ao professor para agendar: o portal público da King (/agendar),
  // não um link pessoal do coordenador.
  const linkAgendamento = linkAgendamentoPublico()

  const enviados = contatos.filter(c => c.enviado).length
  const total    = contatos.length
  const pct      = total > 0 ? Math.round((enviados / total) * 100) : 0
  const completo = total > 0 && enviados >= total

  function toggle(c: ContatoDia) {
    marcar.mutate(
      { id: c.id, enviado: !c.enviado },
      { onError: () => toast.error('Erro ao atualizar contato.') },
    )
  }

  async function copiarMensagem(c: ContatoDia) {
    const ultima = reuniaoUltimaDe(c)
    const mensagem = getDefaultTemplate().build({
      professorNome: c.professor?.nome ?? 'professor(a)',
      coordenadorNome: coordNome,
      dataUltimaReuniao: ultima
        ? new Date(ultima).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
        : null,
      linkAgendamento,
    })
    await navigator.clipboard.writeText(mensagem)
    setCopiadoId(c.id)
    toast.success('Mensagem copiada.')
    setTimeout(() => setCopiadoId(prev => (prev === c.id ? null : prev)), 1800)
  }

  return (
    <section className="card-surface p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-ink-secondary" />
          <h2 className="text-[15px] font-semibold text-ink">Mensagens do dia</h2>
        </div>
        <span className="text-[13px] tabular-nums">
          <span className={cn('font-semibold', completo ? 'text-urg-lowFg' : 'text-ink')}>{enviados}</span>
          <span className="text-ink-muted"> / {total || 20}</span>
        </span>
      </div>

      <p className="text-[11.5px] text-ink-muted leading-snug">
        Mensagem pronta para cada professor, assinada pelo coordenador. Meta de 20 contatos por dia.
      </p>

      <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: completo ? 'var(--urg-low-fg)' : 'var(--accent-blue)' }}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-9 rounded bg-surface-subtle animate-pulse" />)}
        </div>
      ) : total === 0 ? (
        <p className="text-[13px] text-ink-muted">
          Nenhum professor ativo neste grupo para gerar a lista de hoje.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft max-h-[360px] overflow-y-auto">
          {contatos.map(c => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className={cn('text-[13px] truncate', c.enviado ? 'text-ink-muted line-through' : 'text-ink font-medium')}>
                  {c.professor?.nome ?? 'Professor removido'}
                </p>
                {c.professor?.email && (
                  <p className="text-[11px] text-ink-muted truncate">{c.professor.email}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/professores/${c.professor_id}`)}
                  className="btn-press h-7 w-7 p-0 border-line text-ink-secondary"
                  title="Ver perfil"
                >
                  <User className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copiarMensagem(c)}
                  className="btn-press h-7 text-[11px] gap-1.5 border-line text-ink-secondary"
                >
                  {copiadoId === c.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiadoId === c.id ? 'Copiado' : 'Copiar mensagem'}
                </Button>
                <Button
                  size="sm"
                  variant={c.enviado ? 'outline' : 'default'}
                  disabled={marcar.isPending}
                  onClick={() => toggle(c)}
                  className={cn(
                    'btn-press h-7 text-[11px] gap-1.5',
                    c.enviado
                      ? 'border-line text-ink-secondary'
                      : 'bg-urg-lowFg text-white hover:opacity-90',
                  )}
                >
                  {c.enviado ? <><Undo2 className="h-3 w-3" />Desfazer</> : <><Check className="h-3 w-3" />Marcar enviada</>}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
