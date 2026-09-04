import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft, CalendarClock, Check, CircleAlert, CircleHelp, ClipboardCopy,
  FileText, MapPin, MessageSquarePlus, Pencil, Route, Send, Sparkles,
  Target, Trash2, User2, UserCog, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { usePerfisPublicos, useNomesPorPerfilId } from '@/hooks/usePerfisPublicos'
import {
  useProjeto, useEtapasProjeto, useAtualizacoesProjeto, usePedidosInfo,
  useSouLideranca, useAdicionarAtualizacao, useDecidirProjeto, useExcluirProjeto,
  useMoverFase, usePedirInfo, useResponderInfo, useAtualizarConducao,
  useEditarEtapa, useEnviarProjeto, type EtapaProjeto, type Projeto,
} from '@/hooks/useProjetos'
import { FichaProjetoAssistente } from '@/components/projetos/FichaProjetoAssistente'
import { FluxogramaEtapas } from '@/components/projetos/FluxogramaEtapas'
import { AnexosProjeto } from '@/components/projetos/AnexosProjeto'
import {
  FASES_PROJETO, FASE_LABEL, ONDE_LABEL, STATUS_META, TIPO_LABEL, URGENCIA_META,
  FAIXA_PRAZO_CLS, itensFicha, prazoProjeto, proximaFase, fmtData, fmtDataHora,
  type ProjetoFase,
} from '@/lib/projetos'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// A ficha do projeto, em página própria (e não em gaveta).
//
// Três motivos: a ficha completa não cabe numa gaveta de 448px; a página tem
// URL, então o sino e o chamado do TI apontam direto para ela; e dá para
// imprimir/copiar o texto inteiro para quem for executar.
// ─────────────────────────────────────────────────────────────────────────────

export function ProjetoDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const meuId = profile?.id ?? null
  const souLideranca = useSouLideranca()

  const { data: projeto, isLoading } = useProjeto(id)
  const { data: etapas = [] } = useEtapasProjeto(id)
  const { mapa: nomes } = useNomesPorPerfilId()
  const { data: perfis = [] } = usePerfisPublicos()
  const { data: pedidos = [] } = usePedidosInfo()
  const { data: atualizacoes = [] } = useAtualizacoesProjeto(id)

  const decidir   = useDecidirProjeto()
  const moverFase = useMoverFase()
  const conducao  = useAtualizarConducao()
  const pedirInfo = usePedirInfo()
  const responder = useResponderInfo()
  const registrar = useAdicionarAtualizacao()
  const excluir   = useExcluirProjeto()
  const editarEtapa = useEditarEtapa()
  const enviar    = useEnviarProjeto()

  const [motivo, setMotivo]       = useState('')
  const [prazoNovo, setPrazoNovo] = useState('')
  const [respNovo, setRespNovo]   = useState('')
  const [pergunta, setPergunta]   = useState('')
  const [novaNota, setNovaNota]   = useState('')
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [editando, setEditando]   = useState(false)

  const candidatos = useMemo(
    () => perfis.filter(p => p.ativo && ['coordenacao', 'suporte', 'admin'].includes(p.role)),
    [perfis],
  )
  const meusPedidos = useMemo(
    () => pedidos.filter(q => q.projeto_id === id),
    [pedidos, id],
  )

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-6">
        <div className="h-8 w-40 animate-pulse rounded bg-surface-subtle/60" />
        <div className="h-64 animate-pulse rounded-lg bg-surface-subtle/40" />
      </div>
    )
  }

  if (!projeto) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-16 text-center">
        <p className="text-[13px] text-ink-secondary">Projeto não encontrado ou fora do seu acesso.</p>
        <Link to="/projetos" className="mt-3 inline-block text-[12.5px] text-accentBlue hover:underline">
          Voltar para Projetos
        </Link>
      </div>
    )
  }

  const st    = STATUS_META[projeto.status]
  const urg   = URGENCIA_META[projeto.prioridade]
  const prazo = prazoProjeto(projeto.data_entrega, projeto.fase)
  const itens = itensFicha(projeto, etapas.length)
  const faltam = itens.filter(i => !i.ok)

  const souAutor       = !!meuId && projeto.criado_por === meuId
  const souResponsavel = !!meuId && projeto.responsavel_id === meuId
  const podeConduzir   = souLideranca || souResponsavel
  const podeExcluir    = souLideranca || (souAutor && ['rascunho', 'proposto'].includes(projeto.status))
  const emEdicao       = projeto.status === 'rascunho' || projeto.status === 'proposto'
  const podeEditarFicha = souAutor && emEdicao
  const feitas = etapas.filter(e => e.concluida).length

  async function aprovar() {
    try {
      await decidir.mutateAsync({
        id: projeto!.id, status: 'aprovado', motivo,
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

  async function enviarResposta(pid: string) {
    const texto = (respostas[pid] ?? '').trim()
    if (!texto) return
    try {
      await responder.mutateAsync({ id: pid, resposta: texto })
      toast.success('Resposta enviada.')
      setRespostas(r => ({ ...r, [pid]: '' }))
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

  async function reenviar() {
    try {
      await enviar.mutateAsync(projeto!.id)
      toast.success('Ficha enviada para a liderança.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para enviar.')
    }
  }

  async function apagar() {
    if (!confirm('Excluir este projeto? Etapas, anexos, perguntas e andamentos vão junto.')) return
    try {
      await excluir.mutateAsync(projeto!.id)
      toast.success('Projeto excluído.')
      navigate('/projetos')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir.')
    }
  }

  async function copiarFicha() {
    try {
      await navigator.clipboard.writeText(fichaEmTexto(projeto!, etapas, nomes))
      toast.success('Ficha copiada — é só colar no chamado do TI.')
    } catch {
      toast.error('O navegador não deixou copiar.')
    }
  }

  const seguinte = proximaFase(projeto.fase)

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-6 py-6">
      <Link
        to="/projetos"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Projetos
      </Link>

      {/* ── Cabeçalho ── */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="max-w-2xl text-2xl font-semibold leading-tight tracking-tight text-ink">
            {projeto.titulo || 'Rascunho sem título'}
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={copiarFicha}>
              <ClipboardCopy /> Copiar ficha
            </Button>
            {podeEditarFicha && (
              <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
                <Pencil /> Editar ficha
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip cls={st.cls}>{st.label}</Chip>
          <Chip cls={urg.cls}>Urgência {urg.label.toLowerCase()}</Chip>
          <Chip cls="bg-surface-subtle text-ink-secondary">{TIPO_LABEL[projeto.tipo]}</Chip>
          {projeto.onde_aplicado && (
            <Chip cls="bg-surface-subtle text-ink-secondary">
              <MapPin className="h-3 w-3" />{ONDE_LABEL[projeto.onde_aplicado]}
            </Chip>
          )}
          {projeto.status === 'aprovado' && (
            <>
              <Chip cls="bg-accentBlue-soft text-accentBlue">Fase: {FASE_LABEL[projeto.fase]}</Chip>
              <Chip cls={FAIXA_PRAZO_CLS[prazo.faixa]}>
                <CalendarClock className="h-3 w-3" />{prazo.texto}
              </Chip>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <User2 className="h-3 w-3" />
            Sugerido por {nomes.get(projeto.criado_por ?? '') ?? '—'} em {fmtData(projeto.created_at)}
          </span>
          {projeto.responsavel_id && (
            <span className="inline-flex items-center gap-1">
              <UserCog className="h-3 w-3" />
              Responsável: {nomes.get(projeto.responsavel_id) ?? '—'}
            </span>
          )}
          {projeto.data_entrega && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CalendarClock className="h-3 w-3" />Entrega {fmtData(projeto.data_entrega)}
            </span>
          )}
        </div>
      </header>

      {/* Ficha incompleta: o que falta, para autor e liderança verem igual */}
      {faltam.length > 0 && (
        <div className="rounded-lg border border-aviso-warnBd bg-aviso-warnBg px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-aviso-warnFg">
            <CircleAlert className="h-3.5 w-3.5" />
            Ficha incompleta — {faltam.length} {faltam.length === 1 ? 'item pendente' : 'itens pendentes'}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {faltam.map(i => (
              <li key={i.label} className="text-[11.5px] text-aviso-warnFg/90">• {i.label}</li>
            ))}
          </ul>
          {podeEditarFicha && (
            <Button size="sm" className="mt-2.5" onClick={() => setEditando(true)}>
              <Pencil /> Completar a ficha
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* ── A ficha ── */}
        <div className="space-y-5">
          <Secao icone={<Route className="h-3.5 w-3.5" />} titulo="O caminho até o problema">
            <Texto valor={projeto.caminho} />
          </Secao>

          <Secao icone={<Target className="h-3.5 w-3.5" />} titulo="Objetivo">
            <Texto valor={projeto.objetivo} />
          </Secao>

          <Secao icone={<FileText className="h-3.5 w-3.5" />} titulo="Descrição do projeto">
            <Texto valor={projeto.descricao} />
          </Secao>

          {projeto.natureza === 'melhoria' && (
            <Secao icone={<Sparkles className="h-3.5 w-3.5" />} titulo="Como é diferente do que temos hoje">
              <Texto valor={projeto.diferenca_hoje} />
            </Secao>
          )}

          <Secao
            icone={<Route className="h-3.5 w-3.5" />}
            titulo="Como funciona"
            acessorio={etapas.length > 0 ? `${feitas} de ${etapas.length} etapas` : undefined}
          >
            <FluxogramaEtapas
              etapas={etapas}
              onAlternar={
                podeConduzir && projeto.status === 'aprovado'
                  ? (e: EtapaProjeto) => editarEtapa.mutate({ id: e.id, concluida: !e.concluida })
                  : undefined
              }
            />
          </Secao>

          <Secao icone={<Check className="h-3.5 w-3.5" />} titulo="Passo a passo para funcionar">
            <Texto valor={projeto.passo_a_passo} />
          </Secao>

          <Secao icone={<Target className="h-3.5 w-3.5" />} titulo="Resultado esperado">
            <Texto valor={projeto.resultado_esperado} />
          </Secao>

          <Secao icone={<FileText className="h-3.5 w-3.5" />} titulo="Desenho em PDF">
            <AnexosProjeto projetoId={projeto.id} podeEditar={podeEditarFicha || souLideranca} />
          </Secao>
        </div>

        {/* ── Coluna de ação ── */}
        <aside className="space-y-4">
          {projeto.status === 'rascunho' && souAutor && (
            <Bloco titulo="Rascunho">
              <p className="text-[12px] leading-relaxed text-ink-muted">
                Só você enxerga este projeto. Ele vai para a liderança quando a ficha estiver completa.
              </p>
              <Button size="sm" className="mt-2.5 w-full" onClick={reenviar} disabled={faltam.length > 0 || enviar.isPending}>
                <Send /> Enviar para a liderança
              </Button>
            </Bloco>
          )}

          {projeto.motivo_decisao && (
            <Bloco titulo={projeto.status === 'recusado' ? 'Por que foi recusado' : 'Observação da liderança'}>
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-secondary">
                {projeto.motivo_decisao}
              </p>
              <p className="mt-1.5 text-[11px] text-ink-muted">
                {nomes.get(projeto.decidido_por ?? '') ?? '—'} · {fmtDataHora(projeto.decidido_em)}
              </p>
            </Bloco>
          )}

          {souLideranca && projeto.status === 'proposto' && (
            <Bloco titulo="Decisão da liderança">
              <div className="space-y-2.5">
                <div className="space-y-1.5">
                  <Label htmlFor="dec-motivo">Observação</Label>
                  <textarea
                    id="dec-motivo" rows={3} value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    placeholder="Obrigatório para recusar; opcional para aprovar."
                    className="w-full resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dec-prazo">Prazo de entrega</Label>
                  <Input
                    id="dec-prazo" type="date"
                    value={prazoNovo || projeto.data_entrega || ''}
                    onChange={e => setPrazoNovo(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Responsável</Label>
                  <Select value={respNovo || projeto.responsavel_id || 'nenhum'} onValueChange={setRespNovo}>
                    <SelectTrigger><SelectValue placeholder="Escolher" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Sem responsável</SelectItem>
                      {candidatos.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <Button size="sm" className="flex-1" onClick={aprovar} disabled={decidir.isPending}>
                    <Check /> Aprovar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={recusar} disabled={decidir.isPending}>
                    <X /> Recusar
                  </Button>
                </div>
                {faltam.length > 0 && (
                  <p className="text-[11px] leading-snug text-ink-muted">
                    Esta ficha chegou incompleta — vale pedir informação antes de decidir.
                  </p>
                )}
              </div>
            </Bloco>
          )}

          {podeConduzir && projeto.status === 'aprovado' && (
            <Bloco titulo="Condução">
              <div className="space-y-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {FASES_PROJETO.map(f => (
                    <button
                      key={f.key}
                      onClick={() => mover(f.key)}
                      disabled={moverFase.isPending || f.key === projeto.fase}
                      className={cn(
                        'btn-press rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                        f.key === projeto.fase
                          ? 'bg-accentBlue-soft text-accentBlue'
                          : 'bg-surface-subtle text-ink-muted hover:text-ink',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {seguinte && (
                  <Button size="sm" variant="ghost" className="w-full" onClick={() => mover(seguinte)}>
                    Avançar para {FASE_LABEL[seguinte]}
                  </Button>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="cond-prazo">Prazo de entrega</Label>
                  <Input
                    id="cond-prazo" type="date" defaultValue={projeto.data_entrega ?? ''}
                    onBlur={e => {
                      if (e.target.value !== (projeto.data_entrega ?? '')) {
                        salvarConducao({ data_entrega: e.target.value })
                      }
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
            </Bloco>
          )}

          {/* Perguntas — a ponte com a Minha Área de quem sugeriu */}
          {projeto.status !== 'rascunho' && (
            <Bloco titulo="Pedidos de informação" contagem={meusPedidos.filter(q => !q.resposta).length}>
              <div className="space-y-3">
                {meusPedidos.length === 0 && (
                  <p className="text-[12px] text-ink-muted">Nenhuma pergunta ainda.</p>
                )}
                {meusPedidos.map(q => (
                  <div key={q.id} className="space-y-1.5 border-l-2 border-line pl-2.5">
                    <p className="text-[12.5px] leading-snug text-ink">{q.pergunta}</p>
                    <p className="text-[11px] text-ink-muted">
                      {nomes.get(q.solicitado_por ?? '') ?? '—'} · {fmtData(q.created_at)}
                    </p>
                    {q.resposta ? (
                      <div className="rounded-md bg-surface-subtle px-2.5 py-2">
                        <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-ink-secondary">{q.resposta}</p>
                        <p className="mt-1 text-[10.5px] text-ink-muted">
                          {nomes.get(q.respondido_por ?? '') ?? '—'} · {fmtDataHora(q.respondido_em)}
                        </p>
                      </div>
                    ) : q.destinatario_id === meuId ? (
                      <div className="space-y-1.5">
                        <textarea
                          rows={3}
                          value={respostas[q.id] ?? ''}
                          onChange={e => setRespostas(r => ({ ...r, [q.id]: e.target.value }))}
                          placeholder="Sua resposta…"
                          className="w-full resize-y rounded-md border border-line bg-surface-canvas px-2.5 py-2 text-[12px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
                        />
                        <Button size="sm" onClick={() => enviarResposta(q.id)} disabled={responder.isPending}>
                          <Send /> Responder
                        </Button>
                      </div>
                    ) : (
                      <p className="inline-flex items-center gap-1 text-[11px] text-aviso-warnFg">
                        <CircleHelp className="h-3 w-3" /> Esperando resposta
                      </p>
                    )}
                  </div>
                ))}

                {souLideranca && (
                  <div className="space-y-1.5 border-t border-line pt-2.5">
                    <textarea
                      rows={3}
                      value={pergunta}
                      onChange={e => setPergunta(e.target.value)}
                      placeholder="O que ficou faltando entender?"
                      className="w-full resize-y rounded-md border border-line bg-surface-canvas px-2.5 py-2 text-[12px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
                    />
                    <Button size="sm" variant="ghost" className="w-full" onClick={enviarPergunta} disabled={pedirInfo.isPending}>
                      <MessageSquarePlus /> Pedir mais informações
                    </Button>
                  </div>
                )}
              </div>
            </Bloco>
          )}

          {projeto.status === 'aprovado' && (
            <Bloco titulo="Andamento">
              <div className="space-y-2.5">
                <textarea
                  rows={2}
                  value={novaNota}
                  onChange={e => setNovaNota(e.target.value)}
                  placeholder="O que andou hoje?"
                  className="w-full resize-y rounded-md border border-line bg-surface-canvas px-2.5 py-2 text-[12px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
                />
                <Button size="sm" variant="ghost" className="w-full" onClick={registrarAndamento} disabled={registrar.isPending}>
                  Registrar
                </Button>
                {atualizacoes.map(a => (
                  <div key={a.id} className="border-l-2 border-line pl-2.5">
                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-ink-secondary">{a.texto}</p>
                    <p className="mt-0.5 text-[10.5px] text-ink-muted">
                      {nomes.get(a.autor_id ?? '') ?? '—'} · {fmtDataHora(a.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </Bloco>
          )}

          {podeExcluir && (
            <button
              onClick={apagar}
              className="btn-press inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] text-ink-muted transition-colors hover:bg-urg-highBg hover:text-urg-highFg"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir projeto
            </button>
          )}
        </aside>
      </div>

      <FichaProjetoAssistente open={editando} onOpenChange={setEditando} rascunhoId={projeto.id} />
    </div>
  )
}

// ─── Peças ───────────────────────────────────────────────────────────────────

function Chip({ cls, children }: { cls: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium', cls)}>
      {children}
    </span>
  )
}

function Secao({ icone, titulo, acessorio, children }: {
  icone: ReactNode; titulo: string; acessorio?: string; children: ReactNode
}) {
  return (
    <section className="card-surface space-y-2.5 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {icone} {titulo}
        </h2>
        {acessorio && <span className="text-[11px] tabular-nums text-ink-subtle">{acessorio}</span>}
      </div>
      {children}
    </section>
  )
}

function Texto({ valor }: { valor: string | null }) {
  if (!valor?.trim()) {
    return <p className="text-[12.5px] italic text-ink-subtle">Não preenchido.</p>
  }
  return <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-secondary">{valor}</p>
}

function Bloco({ titulo, contagem, children }: {
  titulo: string; contagem?: number; children: ReactNode
}) {
  return (
    <div className="card-surface space-y-2.5 p-4">
      <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {titulo}
        {!!contagem && (
          <span className="rounded-full bg-aviso-warnBg px-1.5 py-px text-[10px] text-aviso-warnFg">{contagem}</span>
        )}
      </h2>
      {children}
    </div>
  )
}

/** Ficha em texto puro — para colar no chamado do TI sem perder nada. */
function fichaEmTexto(p: Projeto, etapas: EtapaProjeto[], nomes: Map<string, string>): string {
  const linhas = [
    `PROJETO: ${p.titulo}`,
    `Tipo: ${TIPO_LABEL[p.tipo]}`,
    `Onde será aplicado: ${p.onde_aplicado ? ONDE_LABEL[p.onde_aplicado] : '—'}`,
    `Urgência: ${URGENCIA_META[p.prioridade].label}`,
    `Sugerido por: ${nomes.get(p.criado_por ?? '') ?? '—'} em ${fmtData(p.created_at)}`,
    p.data_entrega ? `Entrega prevista: ${fmtData(p.data_entrega)}` : '',
    '',
    `CAMINHO ATÉ O PROBLEMA:\n${p.caminho ?? '—'}`,
    '',
    `OBJETIVO:\n${p.objetivo ?? '—'}`,
    '',
    `DESCRIÇÃO:\n${p.descricao ?? '—'}`,
    '',
    p.natureza === 'melhoria' ? `COMO É DIFERENTE DE HOJE:\n${p.diferenca_hoje ?? '—'}\n` : '',
    'ETAPAS:',
    ...etapas.map((e, i) => `  ${i + 1}. ${e.titulo}${e.quem_faz ? ` (${e.quem_faz})` : ''}`),
    '',
    `PASSO A PASSO PARA FUNCIONAR:\n${p.passo_a_passo ?? '—'}`,
    '',
    `RESULTADO ESPERADO:\n${p.resultado_esperado ?? '—'}`,
  ]
  return linhas.filter(l => l !== '').join('\n')
}
