import { useMemo, useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { toast } from 'sonner'
import {
  Lightbulb, Check, ChevronLeft, ChevronRight, CircleAlert, Send, Save, Loader2,
} from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useCriarRascunho, useSalvarFicha, useEnviarProjeto, useEtapasProjeto,
  useProjeto, type FichaInput, type Projeto,
} from '@/hooks/useProjetos'
import { EditorEtapas } from '@/components/projetos/EditorEtapas'
import { AnexosProjeto } from '@/components/projetos/AnexosProjeto'
import {
  TIPO_PROJETO, ONDE_APLICADO, NATUREZA_PROJETO, URGENCIA_META, URGENCIAS,
  itensFicha, type ProjetoNatureza, type ProjetoOnde, type ProjetoTipo, type ProjetoUrgencia,
} from '@/lib/projetos'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// A ficha que o TI exige, quebrada em 5 passos.
//
// Por que assistente e não um formulário só: a régua é estrita (o banco recusa
// envio com ficha incompleta), e um paredão de 10 campos obrigatórios faz a
// pessoa desistir na metade. Em passos, cada tela pede uma coisa e explica por
// que ela é pedida.
//
// Por que um rascunho de verdade no banco: etapas e anexos são linhas ligadas
// ao projeto — precisam de um id. O rascunho aparece só para quem escreveu.
// ─────────────────────────────────────────────────────────────────────────────

const PASSOS = [
  { n: 1, titulo: 'O que é',       subtitulo: 'Nome, onde encosta e o quanto corre.' },
  { n: 2, titulo: 'O problema',    subtitulo: 'O caminho até ele e o que queremos resolver.' },
  { n: 3, titulo: 'A proposta',    subtitulo: 'Explique como se fosse para alguém de fora.' },
  { n: 4, titulo: 'Como funciona', subtitulo: 'As etapas e o passo a passo de uso.' },
  { n: 5, titulo: 'Resultado',     subtitulo: 'O que esperamos e o desenho em PDF.' },
]

interface Campos {
  titulo: string
  descricao: string
  tipo: ProjetoTipo
  prioridade: ProjetoUrgencia
  natureza: ProjetoNatureza
  onde_aplicado: ProjetoOnde | ''
  caminho: string
  objetivo: string
  diferenca_hoje: string
  passo_a_passo: string
  resultado_esperado: string
  data_entrega: string
}

const VAZIO: Campos = {
  titulo: '', descricao: '', tipo: 'sistema', prioridade: 'media', natureza: 'melhoria',
  onde_aplicado: '', caminho: '', objetivo: '', diferenca_hoje: '',
  passo_a_passo: '', resultado_esperado: '', data_entrega: '',
}

function doProjeto(p: Projeto): Campos {
  return {
    titulo: p.titulo ?? '',
    descricao: p.descricao ?? '',
    tipo: p.tipo,
    prioridade: p.prioridade,
    natureza: p.natureza,
    onde_aplicado: p.onde_aplicado ?? '',
    caminho: p.caminho ?? '',
    objetivo: p.objetivo ?? '',
    diferenca_hoje: p.diferenca_hoje ?? '',
    passo_a_passo: p.passo_a_passo ?? '',
    resultado_esperado: p.resultado_esperado ?? '',
    data_entrega: p.data_entrega ?? '',
  }
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Continuar uma ficha existente. Vazio = ficha nova. */
  rascunhoId?: string | null
}

/** Casca do diálogo. O corpo só monta com os dados prontos e é remontado por
 *  `key` a cada abertura — assim o formulário nasce já preenchido, sem efeito
 *  de sincronia (que causaria render em cascata). */
export function FichaProjetoAssistente({ open, onOpenChange, rascunhoId }: Props) {
  const { data: existente, isLoading } = useProjeto(open ? rascunhoId ?? null : null)
  const pronto = !rascunhoId || !!existente

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col',
            'overflow-hidden rounded-xl border border-line bg-surface-canvas text-ink shadow-popover outline-none',
            'duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0',
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="space-y-1">
              <DialogPrimitive.Title className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <Lightbulb className="h-4 w-4 text-accentBlue" />
                {rascunhoId ? 'Continuar a ficha' : 'Sugerir um projeto'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-[12px] text-ink-muted">
                O TI só aceita projeto que dê para executar sem perguntar nada. A ficha vai
                completa ou não vai.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm">
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                <span className="sr-only">Fechar</span>
              </Button>
            </DialogPrimitive.Close>
          </header>

          {pronto ? (
            <CorpoAssistente
              key={`${rascunhoId ?? 'novo'}-${String(open)}`}
              projetoInicial={existente ?? null}
              onFechar={() => onOpenChange(false)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-ink-subtle" />
              {isLoading && <span className="sr-only">Carregando</span>}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ─── Corpo ───────────────────────────────────────────────────────────────────

function CorpoAssistente({ projetoInicial, onFechar }: {
  projetoInicial: Projeto | null
  onFechar: () => void
}) {
  const criar  = useCriarRascunho()
  const salvar = useSalvarFicha()
  const enviar = useEnviarProjeto()

  const [projetoId, setProjetoId] = useState<string | null>(projetoInicial?.id ?? null)
  const [passo, setPasso] = useState(1)
  const [f, setF] = useState<Campos>(projetoInicial ? doProjeto(projetoInicial) : VAZIO)

  const { data: etapas = [] } = useEtapasProjeto(projetoId)

  const itens = useMemo(
    () => itensFicha({ ...f, onde_aplicado: f.onde_aplicado || null }, etapas.length),
    [f, etapas.length],
  )
  const faltam = itens.filter(i => !i.ok)
  const completa = faltam.length === 0

  const patch = (): FichaInput => ({
    titulo: f.titulo,
    descricao: f.descricao,
    tipo: f.tipo,
    prioridade: f.prioridade,
    natureza: f.natureza,
    onde_aplicado: (f.onde_aplicado || null) as ProjetoOnde | null,
    caminho: f.caminho,
    objetivo: f.objetivo,
    diferenca_hoje: f.natureza === 'novo' ? null : f.diferenca_hoje,
    passo_a_passo: f.passo_a_passo,
    resultado_esperado: f.resultado_esperado,
    data_entrega: f.data_entrega || null,
  })

  /** Garante o rascunho no banco e devolve o id — etapas/anexos dependem dele. */
  async function garantirRascunho(): Promise<string | null> {
    try {
      if (projetoId) {
        await salvar.mutateAsync({ id: projetoId, ...patch() })
        return projetoId
      }
      const novo = await criar.mutateAsync(patch())
      setProjetoId(novo.id)
      return novo.id
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para salvar o rascunho.')
      return null
    }
  }

  async function irPara(destino: number) {
    if (destino > passo && !f.titulo.trim()) {
      toast.error('Dê um nome ao projeto para continuar.')
      return
    }
    const id = await garantirRascunho()
    if (!id) return
    setPasso(Math.min(5, Math.max(1, destino)))
  }

  async function salvarESair() {
    if (!f.titulo.trim()) {
      toast.error('Dê um nome ao projeto — sem isso não dá para guardar o rascunho.')
      return
    }
    const id = await garantirRascunho()
    if (!id) return
    toast.success('Rascunho guardado. Ele fica na sua Minha Área.')
    onFechar()
  }

  async function enviarParaLideranca() {
    const id = await garantirRascunho()
    if (!id) return
    try {
      await enviar.mutateAsync(id)
      toast.success('Ficha enviada para a liderança.')
      onFechar()
    } catch (e) {
      // O banco devolve a lista do que falta — é a mesma régua do checklist.
      toast.error(e instanceof Error ? e.message : 'Não deu para enviar.')
    }
  }

  const ocupado = criar.isPending || salvar.isPending || enviar.isPending
  const jaEnviado = projetoInicial?.status === 'proposto'

  return (
    <>
      {/* Trilha dos passos */}
      <nav className="flex items-center gap-1 overflow-x-auto border-b border-line px-5 py-2.5">
        {PASSOS.map(p => {
          const pend = itens.filter(i => i.passo === p.n && !i.ok).length
          const ativo = p.n === passo
          return (
            <button
              key={p.n}
              onClick={() => irPara(p.n)}
              disabled={ocupado}
              className={cn(
                'btn-press flex flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                ativo ? 'bg-surface-subtle text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              <span className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full text-[9.5px] font-semibold',
                pend === 0 ? 'bg-aviso-okBg text-aviso-okFg' : 'bg-surface-subtle text-ink-muted',
              )}>
                {pend === 0 ? <Check className="h-2.5 w-2.5" /> : p.n}
              </span>
              {p.titulo}
            </button>
          )
        })}
      </nav>

      <div className="grid flex-1 gap-0 overflow-hidden md:grid-cols-[1fr_260px]">
        {/* Formulário do passo */}
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-0.5">
            <h3 className="text-[13.5px] font-semibold text-ink">{PASSOS[passo - 1].titulo}</h3>
            <p className="text-[11.5px] text-ink-muted">{PASSOS[passo - 1].subtitulo}</p>
          </div>

          {passo === 1 && (
            <div className="space-y-3.5">
              <Campo id="p-titulo" label="Título" dica="Uma frase curta que já diga do que se trata.">
                <Input
                  id="p-titulo" value={f.titulo} maxLength={120}
                  onChange={e => setF({ ...f, titulo: e.target.value })}
                  placeholder="Ex.: Avisar no WhatsApp quando o professor some do lançamento"
                />
              </Campo>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <Campo label="Tipo">
                  <Select value={f.tipo} onValueChange={v => setF({ ...f, tipo: v as ProjetoTipo })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPO_PROJETO.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Campo>

                <Campo
                  label="Onde será aplicado"
                  dica={ONDE_APLICADO.find(o => o.key === f.onde_aplicado)?.descricao}
                >
                  <Select
                    value={f.onde_aplicado || undefined}
                    onValueChange={v => setF({ ...f, onde_aplicado: v as ProjetoOnde })}
                  >
                    <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                    <SelectContent>
                      {ONDE_APLICADO.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Campo>
              </div>

              <Campo label="Isso já existe hoje?">
                <div className="grid gap-2 sm:grid-cols-2">
                  {NATUREZA_PROJETO.map(n => (
                    <button
                      key={n.key}
                      onClick={() => setF({ ...f, natureza: n.key })}
                      className={cn(
                        'btn-press rounded-lg border px-3 py-2.5 text-left transition-colors',
                        f.natureza === n.key
                          ? 'border-accentBlue bg-accentBlue-soft'
                          : 'border-line hover:bg-surface-subtle/50',
                      )}
                    >
                      <p className="text-[12.5px] font-medium text-ink">{n.label}</p>
                      <p className="mt-0.5 text-[11px] text-ink-muted">{n.descricao}</p>
                    </button>
                  ))}
                </div>
              </Campo>

              <Campo label="Urgência" dica={URGENCIA_META[f.prioridade].descricao}>
                <div className="flex flex-wrap gap-1.5">
                  {URGENCIAS.map(u => (
                    <button
                      key={u}
                      onClick={() => setF({ ...f, prioridade: u })}
                      className={cn(
                        'btn-press rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                        f.prioridade === u
                          ? `${URGENCIA_META[u].cls} ring-1 ring-inset ring-current/25`
                          : 'bg-surface-subtle text-ink-muted hover:text-ink',
                      )}
                    >
                      {URGENCIA_META[u].label}
                    </button>
                  ))}
                </div>
              </Campo>
            </div>
          )}

          {passo === 2 && (
            <div className="space-y-3.5">
              <Campo
                id="p-caminho" label="O caminho até onde o problema aparece"
                dica="A trilha de cliques, como se estivesse ensinando alguém que nunca abriu o sistema."
              >
                <Area
                  id="p-caminho" rows={4} value={f.caminho}
                  onChange={v => setF({ ...f, caminho: v })}
                  placeholder="Ex.: entro no King Management System → menu Turmas → abro a turma → aba Lançamento → o botão de salvar não aparece quando a turma tem mais de 20 alunos."
                />
              </Campo>

              <Campo
                id="p-objetivo" label="O objetivo"
                dica="Uma frase: o que essa melhoria existe para resolver. Não é a solução — é o problema."
              >
                <Area
                  id="p-objetivo" rows={3} value={f.objetivo}
                  onChange={v => setF({ ...f, objetivo: v })}
                  placeholder="Ex.: que a coordenação descubra no mesmo dia que um professor parou de lançar aula, sem depender de alguém olhar a planilha."
                />
              </Campo>
            </div>
          )}

          {passo === 3 && (
            <div className="space-y-3.5">
              <Campo
                id="p-descricao" label="Descrição clara do projeto"
                dica="Explique para quem nunca viu o problema: o que acontece hoje, o que incomoda e o que você propõe."
              >
                <Area
                  id="p-descricao" rows={7} value={f.descricao}
                  onChange={v => setF({ ...f, descricao: v })}
                  placeholder="Hoje… O problema é que… A proposta é…"
                />
              </Campo>

              {f.natureza === 'melhoria' && (
                <Campo
                  id="p-diferenca" label="Como isso é diferente do que temos hoje"
                  dica="Sem o 'antes', ninguém consegue avaliar a proposta nem testar o resultado depois."
                >
                  <Area
                    id="p-diferenca" rows={4} value={f.diferenca_hoje}
                    onChange={v => setF({ ...f, diferenca_hoje: v })}
                    placeholder="Hoje: alguém abre a planilha toda segunda. Depois: o aviso chega sozinho no dia."
                  />
                </Campo>
              )}
            </div>
          )}

          {passo === 4 && (
            <div className="space-y-4">
              <Campo
                label="Etapas do funcionamento"
                dica="Um passo por linha, na ordem em que acontecem. É daqui que sai o fluxograma — você não precisa desenhar nada."
              >
                {projetoId ? (
                  <EditorEtapas projetoId={projetoId} etapas={etapas} />
                ) : (
                  <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-ink-subtle">
                    Preencha o título no passo 1 para começar a listar as etapas.
                  </p>
                )}
              </Campo>

              <Campo
                id="p-passos" label="Passo a passo para funcionar"
                dica="Como se usa depois de pronto. O TI entrega, mas quem opera é o time."
              >
                <Area
                  id="p-passos" rows={5} value={f.passo_a_passo}
                  onChange={v => setF({ ...f, passo_a_passo: v })}
                  placeholder={'1. O coordenador abre a Central de Pendências\n2. Clica em Avisar\n3. A mensagem sai pelo WhatsApp com o texto padrão'}
                />
              </Campo>
            </div>
          )}

          {passo === 5 && (
            <div className="space-y-3.5">
              <Campo
                id="p-resultado" label="Resultado esperado"
                dica="É contra isso que a gente confere, depois de pronto, se deu certo."
              >
                <Area
                  id="p-resultado" rows={4} value={f.resultado_esperado}
                  onChange={v => setF({ ...f, resultado_esperado: v })}
                  placeholder="Ex.: nenhum professor passa mais de 3 dias sem lançamento sem alguém falar com ele."
                />
              </Campo>

              <Campo id="p-prazo" label="Prazo desejado" dica="Opcional — a liderança confirma na aprovação.">
                <Input
                  id="p-prazo" type="date" value={f.data_entrega}
                  onChange={e => setF({ ...f, data_entrega: e.target.value })}
                  className="w-full sm:w-48"
                />
              </Campo>

              <Campo
                label="Desenho do projeto em PDF"
                dica="Opcional, mas ajuda: fluxograma, print com marcação, esboço de tela."
              >
                {projetoId ? (
                  <AnexosProjeto projetoId={projetoId} podeEditar />
                ) : (
                  <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-ink-subtle">
                    Preencha os passos anteriores para anexar arquivos.
                  </p>
                )}
              </Campo>
            </div>
          )}
        </div>

        {/* Checklist do TI — visível o tempo todo, é ele que libera o envio */}
        <aside className="hidden border-l border-line bg-surface-subtle/30 md:block">
          <div className="h-full overflow-y-auto px-4 py-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Pronto para o TI
            </h4>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-subtle">
              {completa
                ? 'Tudo preenchido. Pode enviar.'
                : `Faltam ${faltam.length} ${faltam.length === 1 ? 'item' : 'itens'}.`}
            </p>
            <ul className="mt-3 space-y-2">
              {itens.map(i => (
                <li key={i.label}>
                  <button onClick={() => irPara(i.passo)} className="group flex w-full items-start gap-2 text-left">
                    <span className={cn(
                      'mt-px flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full',
                      i.ok ? 'bg-aviso-okBg text-aviso-okFg' : 'bg-surface-subtle text-ink-subtle',
                    )}>
                      {i.ok ? <Check className="h-2.5 w-2.5" /> : <span className="h-1 w-1 rounded-full bg-current" />}
                    </span>
                    <span className="min-w-0">
                      <span className={cn(
                        'block text-[11.5px] leading-snug',
                        i.ok ? 'text-ink-muted line-through decoration-ink-subtle/40' : 'text-ink-secondary group-hover:text-ink',
                      )}>
                        {i.label}
                      </span>
                      {!i.ok && (
                        <span className="mt-0.5 block text-[10.5px] leading-snug text-ink-subtle">{i.porque}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={salvarESair} disabled={ocupado}>
            <Save /> {jaEnviado ? 'Salvar' : 'Salvar rascunho'}
          </Button>
          {!completa && (
            <span className="hidden items-center gap-1 text-[11px] text-ink-muted sm:inline-flex">
              <CircleAlert className="h-3 w-3" />
              {faltam.length} {faltam.length === 1 ? 'item pendente' : 'itens pendentes'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {passo > 1 && (
            <Button variant="ghost" size="sm" onClick={() => irPara(passo - 1)} disabled={ocupado}>
              <ChevronLeft /> Voltar
            </Button>
          )}
          {passo < 5 ? (
            <Button size="sm" onClick={() => irPara(passo + 1)} disabled={ocupado}>
              Continuar <ChevronRight />
            </Button>
          ) : jaEnviado ? (
            <Button size="sm" onClick={salvarESair} disabled={ocupado}>
              <Save /> Salvar alterações
            </Button>
          ) : (
            <Button size="sm" onClick={enviarParaLideranca} disabled={ocupado || !completa}>
              <Send /> {enviar.isPending ? 'Enviando…' : 'Enviar para a liderança'}
            </Button>
          )}
        </div>
      </footer>
    </>
  )
}

// ─── Peças do formulário ─────────────────────────────────────────────────────

function Campo({ id, label, dica, children }: {
  id?: string; label: string; dica?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {dica && <p className="text-[11px] leading-snug text-ink-muted">{dica}</p>}
      {children}
    </div>
  )
}

function Area({ id, value, onChange, rows, placeholder }: {
  id?: string; value: string; onChange: (v: string) => void; rows: number; placeholder?: string
}) {
  return (
    <textarea
      id={id}
      rows={rows}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
    />
  )
}
