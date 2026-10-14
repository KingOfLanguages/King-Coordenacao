import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Check, ChevronDown, Copy, ExternalLink, LogOut, Pencil } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { isoLocal } from '@/hooks/useParaFazer'
import { useNomesPorPerfilId } from '@/hooks/usePerfisPublicos'
import {
  useRegistrarSaida, useAtualizarSaida, useEncerrarSaida, type SaidaProfessor,
} from '@/hooks/useSaidasProfessor'
import { MENSAGEM_SAIDA, QUEM_FINALIZOU_LABEL, dataBR, situacaoSaida, type QuemFinalizou } from '@/lib/saidaProfessor'

// ─────────────────────────────────────────────────────────────────────────────
// Saída de professor: o diálogo de registro (botão "Solicitou saída" da ficha)
// e o de acompanhamento (selo da ficha e item da Minha Área), com a mensagem
// padrão pronta para copiar nos dois.
// ─────────────────────────────────────────────────────────────────────────────

const CAMPO_TEXTO =
  'w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue transition-colors'

/** A caixa mostra o texto cru, com os *asteriscos* do negrito do WhatsApp:
 *  quem copiar à mão leva exatamente o que vai para o professor. */
export function MensagemSaida({ recolhida = false }: { recolhida?: boolean }) {
  const [aberta, setAberta] = useState(!recolhida)
  const [copiado, setCopiado] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(MENSAGEM_SAIDA)
      setCopiado(true)
      toast.success('Mensagem copiada. É só colar no WhatsApp.')
      setTimeout(() => setCopiado(false), 1800)
    } catch {
      // Sem permissão de área de transferência: deixa o texto selecionado
      // para um Ctrl+C, em vez de fingir que copiou.
      setAberta(true)
      setTimeout(() => {
        if (!caixa.current) return
        const faixa = document.createRange()
        faixa.selectNodeContents(caixa.current)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(faixa)
      })
      toast.error('Não consegui copiar sozinho. O texto ficou selecionado: aperte Ctrl+C.')
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setAberta(v => !v)}
          aria-expanded={aberta}
          className="btn-press label-micro inline-flex items-center gap-1 hover:text-ink"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !aberta && '-rotate-90')} />
          Mensagem para o professor
        </button>
        <button
          type="button"
          onClick={copiar}
          className={cn(
            'btn-press inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
            copiado ? 'border-urg-lowFg text-urg-lowFg' : 'border-line text-ink-secondary hover:text-ink',
          )}
        >
          {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copiado ? 'Copiada' : 'Copiar'}
        </button>
      </div>
      {aberta && (
        <div ref={caixa} className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-subtle px-3 py-2.5 text-[12px] leading-relaxed text-ink-secondary">
          {MENSAGEM_SAIDA}
        </div>
      )}
    </div>
  )
}

/** Data que o professor informou: atalho "Hoje" (saída imediata) ou calendário. */
function CampoData({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const hoje = isoLocal(new Date())
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(valor === hoje ? '' : hoje)}
        className={cn(
          'btn-press rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
          valor === hoje ? 'border-accentBlue bg-accentBlue-soft text-accentBlue' : 'border-line text-ink-secondary hover:text-ink',
        )}
      >
        Hoje
      </button>
      <Input
        type="date"
        value={valor}
        onChange={e => onChange(e.target.value)}
        aria-label="Último dia informado pelo professor"
        className="h-8 w-[150px] bg-surface-canvas border-line text-[12.5px]"
      />
      {valor && (
        <button type="button" onClick={() => onChange('')} className="btn-press text-[11.5px] text-ink-muted hover:text-ink">
          ainda não disse
        </button>
      )}
    </div>
  )
}

// ─── Registrar ──────────────────────────────────────────────────────────────

export function RegistrarSaidaDialog({ open, onOpenChange, professorId, professorNome }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  professorId: string
  professorNome: string
}) {
  const registrar = useRegistrarSaida()
  const [data, setData] = useState('')
  const [observacao, setObservacao] = useState('')

  function fechar(v: boolean) {
    if (!v) { setData(''); setObservacao('') }
    onOpenChange(v)
  }

  function salvar() {
    registrar.mutate(
      { professor_id: professorId, data_saida: data || null, observacao: observacao.trim() || null },
      {
        onSuccess: () => {
          toast.success('Saída registrada. Fica na Minha Área da coordenação e do suporte até a confirmação.')
          fechar(false)
        },
        onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao registrar a saída.'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="bg-surface-canvas border-line text-ink sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-ink font-semibold">{professorNome} solicitou saída</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="label-micro">Último dia que o professor informou</Label>
            <CampoData valor={data} onChange={setData} />
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              {data
                ? `Em ${dataBR(data)} o pedido fica marcado para revisitar a ficha no KTM e confirmar a saída.`
                : 'Se ele ainda não disse, deixe em branco: a mensagem dá 1 dia útil para ele informar, e a data pode ser preenchida depois.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="label-micro">Observação <span className="font-normal normal-case text-ink-subtle">(opcional)</span></Label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              rows={3}
              maxLength={2000}
              className={CAMPO_TEXTO}
              placeholder="Motivo, o que ele contou, combinados…"
            />
          </div>

          <MensagemSaida />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => fechar(false)} className="text-ink-secondary">Cancelar</Button>
            <Button
              onClick={salvar}
              disabled={registrar.isPending}
              className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
            >
              {registrar.isPending ? 'Registrando…' : 'Registrar saída'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Acompanhar e confirmar ──────────────────────────────────────────────────

export function SaidaDetalheDialog({ saida, open, onOpenChange, linkFicha = false }: {
  saida: SaidaProfessor | null
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Na Minha Área: atalho para a ficha do professor. */
  linkFicha?: boolean
}) {
  return (
    <Dialog open={open && !!saida} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-canvas border-line text-ink sm:max-w-lg">
        {saida && <DetalheSaida key={saida.id} saida={saida} linkFicha={linkFicha} onFechar={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function DetalheSaida({ saida, linkFicha, onFechar }: { saida: SaidaProfessor; linkFicha: boolean; onFechar: () => void }) {
  const { mapa: nomes } = useNomesPorPerfilId()
  const atualizar = useAtualizarSaida()
  const encerrar = useEncerrarSaida()

  const [editando, setEditando] = useState(false)
  const [data, setData] = useState(saida.data_saida ?? '')
  const [observacao, setObservacao] = useState(saida.observacao ?? '')
  const [desfecho, setDesfecho] = useState<QuemFinalizou | 'cancelada' | null>(null)
  const [nota, setNota] = useState('')

  const aberta = saida.status === 'aguardando'
  const sit = situacaoSaida(saida)
  const nome = saida.professor?.nome ?? 'Professor'
  const registradoPor = saida.registrado_por ? nomes.get(saida.registrado_por) : null
  const encerradaPor = saida.encerrada_por ? nomes.get(saida.encerrada_por) : null

  function salvarEdicao() {
    atualizar.mutate(
      { id: saida.id, data_saida: data || null, observacao: observacao.trim() || null },
      {
        onSuccess: () => { toast.success('Saída atualizada.'); setEditando(false) },
        onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao salvar.'),
      },
    )
  }

  function confirmar() {
    if (!desfecho) return
    encerrar.mutate(
      {
        id: saida.id,
        status: desfecho === 'cancelada' ? 'cancelada' : 'concluida',
        quem_finalizou: desfecho === 'cancelada' ? null : desfecho,
        nota: nota.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(desfecho === 'cancelada' ? 'Pedido de saída cancelado.' : 'Saída confirmada.')
          onFechar()
        },
        onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao confirmar.'),
      },
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 pr-8 text-ink font-semibold">
          <LogOut className="h-4 w-4 flex-shrink-0 text-urg-highFg" />Saída de {nome}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {/* Data e contador */}
        {editando ? (
          <div className="space-y-3 rounded-lg border border-line p-3">
            <div className="space-y-1.5">
              <Label className="label-micro">Último dia que o professor informou</Label>
              <CampoData valor={data} onChange={setData} />
            </div>
            <div className="space-y-1.5">
              <Label className="label-micro">Observação</Label>
              <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={3} maxLength={2000} className={CAMPO_TEXTO} />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setEditando(false); setData(saida.data_saida ?? ''); setObservacao(saida.observacao ?? '') }}>Cancelar</Button>
              <Button size="sm" onClick={salvarEdicao} disabled={atualizar.isPending}>{atualizar.isPending ? 'Salvando…' : 'Salvar'}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-[13px] text-ink">
                  {saida.data_saida
                    ? <>Último dia: <strong className="font-semibold">{dataBR(saida.data_saida)}</strong></>
                    : <>Data ainda não informada · prazo para informar: <strong className="font-semibold">{dataBR(sit.prazo)}</strong></>}
                </p>
                <p className="text-[11.5px] text-ink-muted">
                  Registrado {registradoPor ? `por ${registradoPor} ` : ''}em {new Date(saida.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              {aberta && (
                <span className={cn(
                  'whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold tabular-nums',
                  sit.vencida ? 'bg-urg-highBg text-urg-highFg' : sit.dias <= 1 ? 'bg-aviso-warnBg text-aviso-warnFg' : 'bg-surface-subtle text-ink-secondary',
                )}>
                  {sit.contagem}
                </span>
              )}
            </div>
            {saida.observacao && (
              <p className="whitespace-pre-wrap rounded-md bg-surface-subtle px-3 py-2 text-[12.5px] leading-relaxed text-ink-secondary">{saida.observacao}</p>
            )}
            {aberta && (
              <button type="button" onClick={() => setEditando(true)} className="btn-press inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-secondary hover:text-ink">
                <Pencil className="h-3 w-3" />Alterar data ou observação
              </button>
            )}
          </div>
        )}

        {/* O que o King mostra */}
        {aberta && (sit.desligadoNoKing ? (
          <p className="rounded-md border border-aviso-okBd bg-aviso-okBg px-3 py-2 text-[12px] leading-relaxed text-aviso-okFg">
            O King já mostra o desligamento de {nome.split(' ')[0]}
            {saida.professor?.desligado_em ? ` desde ${new Date(saida.professor.desligado_em).toLocaleDateString('pt-BR')}` : ''}.
            Falta só confirmar quem fez.
          </p>
        ) : sit.vencida ? (
          <p className="rounded-md border border-aviso-warnBd bg-aviso-warnBg px-3 py-2 text-[12px] leading-relaxed text-aviso-warnFg">
            {saida.data_saida ? 'A data passou' : 'O prazo para informar a data passou'} e o King ainda não mostra o professor
            como desligado. Confira no King; se ele não preencheu o desligamento, faça por ele e marque “Nós fizemos”.
          </p>
        ) : (
          <p className="text-[11.5px] leading-relaxed text-ink-muted">
            Quem cuida é o suporte ao professor. O pedido fica na Minha Área da coordenação e do suporte até alguém
            confirmar a saída.
          </p>
        ))}

        {/* Desfecho de uma saída já encerrada */}
        {!aberta && (
          <p className={cn(
            'rounded-md px-3 py-2 text-[12.5px] leading-relaxed',
            saida.status === 'concluida' ? 'border border-aviso-okBd bg-aviso-okBg text-aviso-okFg' : 'bg-surface-subtle text-ink-secondary',
          )}>
            {saida.status === 'concluida'
              ? <>Saída confirmada: {QUEM_FINALIZOU_LABEL[saida.quem_finalizou!]}</>
              : <>Pedido cancelado</>}
            {saida.encerrada_em && <> em {new Date(saida.encerrada_em).toLocaleDateString('pt-BR')}</>}
            {encerradaPor && <> por {encerradaPor}</>}.
            {saida.nota_encerramento && <span className="mt-1 block whitespace-pre-wrap">{saida.nota_encerramento}</span>}
          </p>
        )}

        {aberta && <MensagemSaida recolhida />}

        {/* Confirmação */}
        {aberta && (
          <div className="space-y-2 border-t border-line-soft pt-3">
            <p className="label-micro">Confirmar a saída</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {([
                ['professor', 'O professor concluiu', 'Ele mesmo preencheu o desligamento no King.'],
                ['equipe', 'Nós fizemos', 'Ele não fez até a data; a equipe fez o desligamento.'],
              ] as [QuemFinalizou, string, string][]).map(([v, titulo, sub]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDesfecho(d => (d === v ? null : v))}
                  aria-pressed={desfecho === v}
                  className={cn(
                    'btn-press rounded-lg border px-3 py-2 text-left transition-colors',
                    desfecho === v ? 'border-accentBlue bg-accentBlue-soft' : 'border-line hover:bg-surface-subtle',
                    v === 'equipe' && sit.vencida && !sit.desligadoNoKing && desfecho !== v && 'border-aviso-warnBd',
                  )}
                >
                  <span className={cn('block text-[12.5px] font-medium', desfecho === v ? 'text-accentBlue' : 'text-ink')}>{titulo}</span>
                  <span className="block text-[11px] leading-snug text-ink-muted">{sub}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDesfecho(d => (d === 'cancelada' ? null : 'cancelada'))}
              aria-pressed={desfecho === 'cancelada'}
              className={cn(
                'btn-press text-[11.5px] font-medium',
                desfecho === 'cancelada' ? 'text-urg-highFg underline' : 'text-ink-muted hover:text-ink',
              )}
            >
              Ele desistiu / registrado por engano
            </button>

            {desfecho && (
              <div className="space-y-2">
                <textarea
                  value={nota}
                  onChange={e => setNota(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  className={CAMPO_TEXTO}
                  placeholder={desfecho === 'cancelada' ? 'O que aconteceu? (opcional)' : 'Algum detalhe? (opcional)'}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={confirmar}
                    disabled={encerrar.isPending}
                    className={cn('btn-press text-white', desfecho === 'cancelada' ? 'bg-urg-highFg hover:opacity-90' : 'bg-accentBlue hover:bg-accentBlue-hov')}
                  >
                    {encerrar.isPending ? 'Salvando…' : desfecho === 'cancelada' ? 'Cancelar pedido' : 'Confirmar saída'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {linkFicha && (
          <Link
            to={`/professores/${saida.professor_id}`}
            onClick={onFechar}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-accentBlue hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />Abrir a ficha do professor
          </Link>
        )}
      </div>
    </>
  )
}
