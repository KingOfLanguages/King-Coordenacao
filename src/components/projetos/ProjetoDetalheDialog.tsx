import { useMemo, useState, type ReactNode } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { toast } from 'sonner'
import {
  CalendarClock, Check, CircleHelp, MessageSquarePlus, Trash2, UserCog,
  User2, X, ArrowRight, Sparkles, ClipboardList, Send,
} from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { usePerfisPublicos, useNomesPorPerfilId } from '@/hooks/usePerfisPublicos'
import {
  useAtualizacoesProjeto, usePedidosInfo, useSouLideranca,
  useAdicionarAtualizacao, useDecidirProjeto, useExcluirProjeto,
  useMoverFase, usePedirInfo, useResponderInfo, useAtualizarConducao,
  type Projeto,
} from '@/hooks/useProjetos'
import {
  FASES_PROJETO, FASE_LABEL, PRIORIDADE_META, STATUS_META, TIPO_LABEL,
  FAIXA_PRAZO_CLS, prazoProjeto, proximaFase, fmtData, fmtDataHora, iniciais,
  type ProjetoFase,
} from '@/lib/projetos'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  projeto: Projeto | null
}

/** Painel do projeto: a proposta, a decisão da liderança, a fase, as perguntas
 *  em aberto e o diário de andamento. É a mesma tela em /projetos e na Minha Área. */
export function ProjetoDetalheDialog({ open, onOpenChange, projeto }: Props) {
  const { profile } = useAuth()
  const meuId = profile?.id ?? null
  const souLideranca = useSouLideranca()

  const { mapa: nomes } = useNomesPorPerfilId()
  const { data: perfis = [] } = usePerfisPublicos()
  const { data: pedidos = [] } = usePedidosInfo()
  const { data: atualizacoes = [] } = useAtualizacoesProjeto(projeto?.id)

  const decidir    = useDecidirProjeto()
  const moverFase  = useMoverFase()
  const conducao   = useAtualizarConducao()
  const pedirInfo  = usePedirInfo()
  const responder  = useResponderInfo()
  const registrar  = useAdicionarAtualizacao()
  const excluir    = useExcluirProjeto()

  const [motivo, setMotivo]           = useState('')
  const [prazoNovo, setPrazoNovo]     = useState('')
  const [respNovo, setRespNovo]       = useState('')
  const [pergunta, setPergunta]       = useState('')
  const [novaNota, setNovaNota]       = useState('')
  const [respostas, setRespostas]     = useState<Record<string, string>>({})

  // Só pessoas que tocam professores podem conduzir um projeto.
  const candidatos = useMemo(
    () => perfis.filter(p => p.ativo && ['coordenacao', 'suporte', 'admin'].includes(p.role)),
    [perfis],
  )

  const meusPedidos = useMemo(
    () => pedidos.filter(q => q.projeto_id === projeto?.id),
    [pedidos, projeto?.id],
  )

  if (!projeto) return null

  const st = STATUS_META[projeto.status]
  const pr = PRIORIDADE_META[projeto.prioridade]
  const prazo = prazoProjeto(projeto.data_entrega, projeto.fase)
  const souResponsavel = !!meuId && projeto.responsavel_id === meuId
  const souAutor       = !!meuId && projeto.criado_por === meuId
  const podeConduzir   = souLideranca || souResponsavel
  const podeExcluir    = souLideranca || (souAutor && projeto.status === 'proposto')

  async function aprovar() {
    try {
      await decidir.mutateAsync({
        id: projeto!.id,
        status: 'aprovado',
        motivo,
        data_entrega: prazoNovo || projeto!.data_entrega,
        responsavel_id: respNovo === 'nenhum' ? null : (respNovo || projeto!.responsavel_id),
      })
      toast.success('Projeto aprovado.')
      setMotivo(''); setPrazoNovo(''); setRespNovo('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao aprovar.')
    }
  }

  async function recusar() {
    if (!motivo.trim()) {
      toast.error('Diga por que está recusando — quem sugeriu vê esse texto.')
      return
    }
    try {
      await decidir.mutateAsync({ id: projeto!.id, status: 'recusado', motivo })
      toast.success('Projeto recusado.')
      setMotivo('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao recusar.')
    }
  }

  async function mover(fase: ProjetoFase) {
    try {
      await moverFase.mutateAsync({ id: projeto!.id, fase })
      toast.success(`Fase: ${FASE_LABEL[fase]}.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao mudar a fase.')
    }
  }

  async function salvarConducao(patch: { data_entrega?: string | null; responsavel_id?: string | null }) {
    try {
      await conducao.mutateAsync({ id: projeto!.id, ...patch })
      toast.success('Atualizado.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar.')
    }
  }

  async function enviarPergunta() {
    if (!pergunta.trim()) return
    try {
      await pedirInfo.mutateAsync({ projetoId: projeto!.id, pergunta })
      toast.success('Pedido enviado — cai na Minha Área de quem responde.')
      setPergunta('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao pedir informação.')
    }
  }

  async function enviarResposta(id: string) {
    const texto = (respostas[id] ?? '').trim()
    if (!texto) return
    try {
      await responder.mutateAsync({ id, resposta: texto })
      toast.success('Resposta enviada.')
      setRespostas(r => ({ ...r, [id]: '' }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao responder.')
    }
  }

  async function registrarAndamento() {
    if (!novaNota.trim()) return
    try {
      await registrar.mutateAsync({ projetoId: projeto!.id, texto: novaNota })
      setNovaNota('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar.')
    }
  }

  async function apagar() {
    if (!confirm('Excluir este projeto? Perguntas e andamentos vão junto.')) return
    try {
      await excluir.mutateAsync(projeto!.id)
      toast.success('Projeto excluído.')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir.')
    }
  }

  const seguinte = proximaFase(projeto.fase)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-lg flex-col gap-4 overflow-y-auto',
            'bg-surface-canvas border-l border-line px-5 py-5 text-ink shadow-popover outline-none',
            'duration-200 data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right',
          )}
        >
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" className="absolute top-3 right-3" size="icon-sm">
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              <span className="sr-only">Fechar</span>
            </Button>
          </DialogPrimitive.Close>

          {/* ── Cabeçalho ── */}
          <div className="space-y-2 pr-8">
            <DialogPrimitive.Title className="text-[15px] font-semibold leading-snug text-ink">
              {projeto.titulo}
            </DialogPrimitive.Title>
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip className={st.cls}>{st.label}</Chip>
              {projeto.status === 'aprovado' && <Chip className="bg-accentBlue-soft text-accentBlue">{FASE_LABEL[projeto.fase]}</Chip>}
              <Chip className="bg-surface-subtle text-ink-secondary">{TIPO_LABEL[projeto.tipo]}</Chip>
              <Chip className={pr.cls}>Prioridade {pr.label.toLowerCase()}</Chip>
            </div>
          </div>

          {/* ── Meta ── */}
          <div className="space-y-1.5 text-[12px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <User2 className="h-3.5 w-3.5" />
              Sugerido por <strong className="font-medium text-ink-secondary">{nomes.get(projeto.criado_por ?? '') ?? '—'}</strong>
              em {fmtData(projeto.created_at)}
            </span>
            <span className="flex items-center gap-1.5">
              <UserCog className="h-3.5 w-3.5" />
              {projeto.responsavel_id
                ? <>Responsável: <strong className="font-medium text-ink-secondary">{nomes.get(projeto.responsavel_id) ?? '—'}</strong></>
                : <>Sem responsável definido</>}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Entrega prevista: <strong className="font-medium text-ink-secondary">{fmtData(projeto.data_entrega)}</strong>
              {projeto.status === 'aprovado' && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10.5px] font-medium', FAIXA_PRAZO_CLS[prazo.faixa])}>
                  {prazo.texto}
                </span>
              )}
            </span>
          </div>

          {/* ── A proposta ── */}
          <Bloco titulo="A proposta" icone={<ClipboardList className="h-3.5 w-3.5" />}>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-secondary">{projeto.descricao}</p>
            {projeto.impacto && (
              <div className="rounded-md bg-surface-subtle px-3 py-2">
                <p className="mb-0.5 flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wide text-ink-muted">
                  <Sparkles className="h-3 w-3" /> Ganho esperado
                </p>
                <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-secondary">{projeto.impacto}</p>
              </div>
            )}
          </Bloco>

          {/* ── Decisão registrada ── */}
          {projeto.decidido_em && (
            <div className={cn('rounded-md border px-3 py-2.5',
              projeto.status === 'aprovado' ? 'border-aviso-okBd bg-aviso-okBg' : 'border-line bg-surface-subtle')}>
              <p className="text-[11px] font-medium text-ink-secondary">
                {st.label} por {nomes.get(projeto.decidido_por ?? '') ?? '—'} · {fmtDataHora(projeto.decidido_em)}
              </p>
              {projeto.motivo_decisao && (
                <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-secondary">{projeto.motivo_decisao}</p>
              )}
            </div>
          )}

          {/* ── Aprovação (só liderança, só enquanto proposto) ── */}
          {souLideranca && projeto.status === 'proposto' && (
            <Bloco titulo="Decisão da liderança" icone={<Check className="h-3.5 w-3.5" />}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dec-prazo">Entrega prevista</Label>
                  <Input
                    id="dec-prazo" type="date"
                    value={prazoNovo || projeto.data_entrega || ''}
                    onChange={e => setPrazoNovo(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Responsável</Label>
                  <Select value={respNovo || projeto.responsavel_id || 'nenhum'} onValueChange={setRespNovo}>
                    <SelectTrigger><SelectValue placeholder="Definir depois" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Definir depois</SelectItem>
                      {candidatos.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <textarea
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                rows={3}
                placeholder="Comentário da decisão — obrigatório ao recusar."
                className="w-full resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="destructive" size="sm" onClick={recusar} disabled={decidir.isPending}>
                  <X /> Recusar
                </Button>
                <Button size="sm" onClick={aprovar} disabled={decidir.isPending}>
                  <Check /> Aprovar
                </Button>
              </div>
            </Bloco>
          )}

          {/* ── Condução: fase, prazo e responsável ── */}
          {projeto.status === 'aprovado' && (
            <Bloco titulo="Andamento" icone={<ArrowRight className="h-3.5 w-3.5" />}>
              <div className="flex flex-wrap items-center gap-1.5">
                {FASES_PROJETO.map(f => {
                  const atual = f.key === projeto.fase
                  return (
                    <button
                      key={f.key}
                      disabled={!podeConduzir || atual || moverFase.isPending}
                      onClick={() => mover(f.key)}
                      className={cn(
                        'btn-press rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                        atual
                          ? 'bg-accentBlue text-white'
                          : podeConduzir
                            ? 'bg-surface-subtle text-ink-secondary hover:bg-surface-subtle/70'
                            : 'bg-surface-subtle text-ink-muted cursor-default',
                      )}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>
              {podeConduzir && seguinte && (
                <Button variant="outline" size="sm" onClick={() => mover(seguinte)} disabled={moverFase.isPending}>
                  Avançar para {FASE_LABEL[seguinte]} <ArrowRight />
                </Button>
              )}
              {!podeConduzir && (
                <p className="text-[11.5px] text-ink-muted">
                  Só a liderança ou o responsável muda a fase.
                </p>
              )}

              {podeConduzir && (
                <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cond-prazo">Entrega prevista</Label>
                    <Input
                      id="cond-prazo" type="date"
                      defaultValue={projeto.data_entrega ?? ''}
                      onBlur={e => {
                        const v = e.target.value || null
                        if (v !== projeto.data_entrega) salvarConducao({ data_entrega: v })
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Responsável</Label>
                    <Select
                      value={projeto.responsavel_id ?? 'nenhum'}
                      onValueChange={v => salvarConducao({ responsavel_id: v === 'nenhum' ? null : v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhum">Sem responsável</SelectItem>
                        {candidatos.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </Bloco>
          )}

          {/* ── Pedidos de informação ── */}
          <Bloco titulo="Pedidos de informação" icone={<CircleHelp className="h-3.5 w-3.5" />}>
            {meusPedidos.length === 0 && (
              <p className="text-[12px] text-ink-muted">Nenhuma pergunta sobre este projeto.</p>
            )}
            {meusPedidos.map(q => {
              const souDestinatario = !!meuId && q.destinatario_id === meuId
              return (
                <div key={q.id} className="rounded-md border border-line bg-surface-subtle/50 px-3 py-2.5 space-y-2">
                  <div className="space-y-0.5">
                    <p className="text-[10.5px] font-medium uppercase tracking-wide text-ink-muted">
                      {nomes.get(q.solicitado_por ?? '') ?? 'Liderança'} perguntou · {fmtData(q.created_at)}
                    </p>
                    <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{q.pergunta}</p>
                  </div>

                  {q.resposta ? (
                    <div className="border-l-2 border-aviso-okBd pl-2.5">
                      <p className="text-[10.5px] font-medium uppercase tracking-wide text-ink-muted">
                        {nomes.get(q.respondido_por ?? '') ?? '—'} respondeu · {fmtData(q.respondido_em)}
                      </p>
                      <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-secondary">{q.resposta}</p>
                    </div>
                  ) : souDestinatario ? (
                    <div className="space-y-2">
                      <textarea
                        value={respostas[q.id] ?? ''}
                        onChange={e => setRespostas(r => ({ ...r, [q.id]: e.target.value }))}
                        rows={3}
                        placeholder="Sua resposta…"
                        className="w-full resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
                      />
                      <div className="flex justify-end">
                        <Button size="sm" onClick={() => enviarResposta(q.id)} disabled={responder.isPending}>
                          <Send /> Responder
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11.5px] text-aviso-warnFg">
                      Aguardando {nomes.get(q.destinatario_id ?? '') ?? 'resposta'}.
                    </p>
                  )}
                </div>
              )
            })}

            {souLideranca && (
              <div className="space-y-2 border-t border-line pt-3">
                <textarea
                  value={pergunta}
                  onChange={e => setPergunta(e.target.value)}
                  rows={3}
                  placeholder="O que você precisa saber antes de decidir?"
                  className="w-full resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-ink-muted">
                    Vai para {nomes.get(projeto.responsavel_id ?? projeto.criado_por ?? '') ?? 'quem sugeriu'}.
                  </p>
                  <Button variant="outline" size="sm" onClick={enviarPergunta} disabled={!pergunta.trim() || pedirInfo.isPending}>
                    <MessageSquarePlus /> Pedir informação
                  </Button>
                </div>
              </div>
            )}
          </Bloco>

          {/* ── Diário ── */}
          <Bloco titulo="Registro de andamento" icone={<ClipboardList className="h-3.5 w-3.5" />}>
            {atualizacoes.length === 0 && (
              <p className="text-[12px] text-ink-muted">Nada registrado ainda.</p>
            )}
            {atualizacoes.map(a => (
              <div key={a.id} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-subtle text-[9.5px] font-semibold text-ink-secondary">
                  {iniciais(nomes.get(a.autor_id ?? ''))}
                </span>
                <div className="min-w-0">
                  <p className="text-[10.5px] text-ink-muted">
                    {nomes.get(a.autor_id ?? '') ?? '—'} · {fmtDataHora(a.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-secondary">{a.texto}</p>
                </div>
              </div>
            ))}
            <div className="space-y-2 border-t border-line pt-3">
              <textarea
                value={novaNota}
                onChange={e => setNovaNota(e.target.value)}
                rows={2}
                placeholder="O que andou desde a última vez?"
                className="w-full resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
              />
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={registrarAndamento} disabled={!novaNota.trim() || registrar.isPending}>
                  Registrar
                </Button>
              </div>
            </div>
          </Bloco>

          {podeExcluir && (
            <div className="mt-auto border-t border-line pt-3">
              <Button variant="ghost" size="sm" onClick={apagar} disabled={excluir.isPending} className="text-urg-highFg hover:bg-urg-highBg">
                <Trash2 /> Excluir projeto
              </Button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Chip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium', className)}>
      {children}
    </span>
  )
}

function Bloco({ titulo, icone, children }: { titulo: string; icone: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5 rounded-lg border border-line bg-surface-canvas p-3.5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {icone} {titulo}
      </h3>
      {children}
    </section>
  )
}
