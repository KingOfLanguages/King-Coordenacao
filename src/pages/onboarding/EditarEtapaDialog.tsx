import { useState } from 'react'
import {
  Plus, Trash2, ChevronUp, ChevronDown, Type, Video, Image as ImageIcon,
  AlertTriangle, ListChecks, Eye, Heading1, Heading2, Code2, PanelLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { videoEmbed } from '@/lib/videoEmbed'
import { BlocoView } from '@/pages/welcomePath/Blocos'
import { CALLOUT_VARIANTES, varianteDoCallout } from '@/pages/welcomePath/callout'
import {
  useBlocosAdmin, useQuestoesAdmin, useSalvarBloco, useExcluirBloco,
  useSalvarQuestao, useExcluirQuestao,
  type EtapaAdmin, type BlocoAdmin, type QuestaoAdmin,
  type TipoBlocoAdmin, type TipoQuestaoAdmin,
} from '@/hooks/useWelcomePathAdmin'

// ─────────────────────────────────────────────────────────────────────────────
// Editor de uma etapa: elementos de conteúdo e atividades.
//
// O vocabulário de elementos é o MESMO da área de materiais da King — título,
// subtítulo, parágrafo, vídeo, destaque —, então quem já monta material lá
// monta a trilha aqui sem aprender nada novo. A primeira versão pedia HTML cru
// num textarea, o que só funcionava para quem escreve HTML.
//
// Salva no blur de cada campo, sem botão "salvar tudo": o app original perdia
// tudo se a aba fechasse antes do salvar, e o botão único escondia quais
// alterações já tinham ido para o banco.
//
// O preview usa o MESMO componente que o professor vê (BlocoView), não uma
// reimplementação — é o que garante que o resultado seja igual dos dois lados.
// ─────────────────────────────────────────────────────────────────────────────

const TIPOS_ELEMENTO: {
  id: TipoBlocoAdmin; label: string; icone: typeof Type; dica: string
}[] = [
  { id: 'h1',      label: 'Título',    icone: Heading1,      dica: 'Título de uma seção do conteúdo.' },
  { id: 'h2',      label: 'Subtítulo', icone: Heading2,      dica: 'Divisão dentro de uma seção.' },
  { id: 'text',    label: 'Parágrafo', icone: Type,          dica: 'Texto corrido. Quebras de linha são respeitadas.' },
  { id: 'video',   label: 'Vídeo',     icone: Video,         dica: 'YouTube, Vimeo ou arquivo .mp4.' },
  { id: 'imagem',  label: 'Imagem',    icone: ImageIcon,     dica: 'Print de tela ou foto, por URL.' },
  { id: 'callout', label: 'Destaque',  icone: AlertTriangle, dica: 'Caixa colorida — informação, atenção ou alerta.' },
  { id: 'html',    label: 'HTML',      icone: Code2,         dica: 'Escotilha de fuga: só para conteúdo já pronto em HTML.' },
]

const TIPO_POR_ID = Object.fromEntries(TIPOS_ELEMENTO.map(t => [t.id, t]))

const TIPOS_QUESTAO: { id: TipoQuestaoAdmin; label: string; dica: string }[] = [
  { id: 'multipla_escolha',  label: 'Múltipla escolha',    dica: 'Uma alternativa correta.' },
  { id: 'multipla_selecao',  label: 'Múltipla seleção',    dica: 'Várias corretas — o professor precisa marcar todas.' },
  { id: 'verdadeiro_falso',  label: 'Verdadeiro ou falso', dica: 'Duas alternativas.' },
  { id: 'dissertativa',      label: 'Dissertativa',        dica: 'Resposta escrita, corrigida por vocês na aba Welcome Path.' },
]

const INPUT = 'w-full rounded-lg border border-line bg-surface-canvas px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-accentBlue focus:outline-none focus:ring-2 focus:ring-accentBlue-soft'

function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="text-[10.5px] font-medium uppercase tracking-wide text-ink-muted">{children}</span>
}

/** Campo que só grava no blur — digitar não pode virar uma requisição por tecla. */
function CampoTexto({
  valor, onSalvar, placeholder, multilinha, linhas = 3, mono, destaque,
}: {
  valor: string
  onSalvar: (v: string) => void
  placeholder?: string
  multilinha?: boolean
  linhas?: number
  mono?: boolean
  destaque?: 'h1' | 'h2'
}) {
  const [texto, setTexto] = useState(valor)
  const [anterior, setAnterior] = useState(valor)
  if (valor !== anterior) {
    setAnterior(valor)
    setTexto(valor)
  }

  const classe = cn(
    INPUT,
    mono && 'font-mono text-[12px]',
    destaque === 'h1' && 'text-[15px] font-bold tracking-[-0.01em]',
    destaque === 'h2' && 'text-[14px] font-semibold',
  )

  const comum = {
    value: texto,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setTexto(e.target.value),
    onBlur: () => { if (texto !== valor) onSalvar(texto) },
    placeholder,
    className: classe,
  }

  return multilinha
    ? <textarea {...comum} rows={linhas} className={cn(classe, 'resize-y')} />
    : <input {...comum} />
}

// ─── Elemento de conteúdo ─────────────────────────────────────────────────────

function EditorElemento({
  bloco, primeiro, ultimo, numero, onMover,
}: {
  bloco: BlocoAdmin
  primeiro: boolean
  ultimo: boolean
  numero: number
  onMover: (direcao: -1 | 1) => void
}) {
  const salvar = useSalvarBloco()
  const excluir = useExcluirBloco()

  function patch(campos: Partial<BlocoAdmin>) {
    salvar.mutate({ id: bloco.id, etapa_id: bloco.etapa_id, ...campos }, {
      onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.'),
    })
  }

  /** Trocar de tipo preserva o texto: quem escreveu um parágrafo e percebeu que
   *  era um destaque não deve perder o que digitou. */
  function trocarTipo(tipo: TipoBlocoAdmin) {
    if (tipo === bloco.tipo) return
    patch({
      tipo,
      meta: tipo === 'callout' && !bloco.meta?.calloutVariant
        ? { ...bloco.meta, calloutVariant: 'info' }
        : bloco.meta,
    })
  }

  const cfg = TIPO_POR_ID[bloco.tipo] ?? TIPO_POR_ID.text
  const Icone = cfg.icone
  const embed = bloco.tipo === 'video' ? videoEmbed(bloco.url) : null

  return (
    <div className="rounded-xl border border-line-soft bg-surface-subtle/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="w-5 flex-shrink-0 text-[11px] font-semibold tabular-nums text-ink-subtle">
          {numero}
        </span>

        <span className="flex flex-shrink-0 items-center gap-1.5 text-ink-muted">
          <Icone className="h-3.5 w-3.5" />
        </span>

        <select
          value={bloco.tipo}
          onChange={e => trocarTipo(e.target.value as TipoBlocoAdmin)}
          title={cfg.dica}
          className="h-7 min-w-0 flex-1 rounded-lg border border-line bg-surface-canvas px-2 text-[12px] font-medium text-ink focus:border-accentBlue focus:outline-none"
        >
          {TIPOS_ELEMENTO.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>

        {bloco.tipo === 'callout' && (
          <select
            value={varianteDoCallout(bloco.meta)}
            onChange={e => patch({ meta: { ...bloco.meta, calloutVariant: e.target.value } })}
            className="h-7 flex-shrink-0 rounded-lg border border-line bg-surface-canvas px-2 text-[12px] text-ink focus:border-accentBlue focus:outline-none"
          >
            {Object.entries(CALLOUT_VARIANTES).map(([id, v]) => (
              <option key={id} value={id}>{v.rotulo}</option>
            ))}
          </select>
        )}

        <div className="flex flex-shrink-0 gap-0.5">
          <button type="button" disabled={primeiro} onClick={() => onMover(-1)}
            className="btn-press rounded p-1 text-ink-muted hover:bg-surface-canvas hover:text-ink disabled:opacity-30" title="Subir">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" disabled={ultimo} onClick={() => onMover(1)}
            className="btn-press rounded p-1 text-ink-muted hover:bg-surface-canvas hover:text-ink disabled:opacity-30" title="Descer">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirm('Excluir este elemento?')) return
              excluir.mutate(bloco.id, { onError: () => toast.error('Não foi possível excluir.') })
            }}
            className="btn-press rounded p-1 text-ink-muted hover:bg-surface-canvas hover:text-urg-highFg"
            title="Excluir"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-2 pl-7">
        {(bloco.tipo === 'h1' || bloco.tipo === 'h2') && (
          <CampoTexto
            valor={bloco.conteudo ?? ''}
            onSalvar={v => patch({ conteudo: v || null })}
            placeholder={bloco.tipo === 'h1' ? 'Título da seção' : 'Subtítulo'}
            destaque={bloco.tipo}
          />
        )}

        {bloco.tipo === 'text' && (
          <CampoTexto
            valor={bloco.conteudo ?? ''}
            onSalvar={v => patch({ conteudo: v || null })}
            placeholder="Escreva o parágrafo…"
            multilinha
            linhas={4}
          />
        )}

        {bloco.tipo === 'callout' && (
          <>
            <CampoTexto
              valor={bloco.titulo ?? ''}
              onSalvar={v => patch({ titulo: v || null })}
              placeholder="Título do destaque (opcional)"
            />
            <CampoTexto
              valor={bloco.conteudo ?? ''}
              onSalvar={v => patch({ conteudo: v || null })}
              placeholder="O que o professor precisa saber…"
              multilinha
              linhas={3}
            />
          </>
        )}

        {bloco.tipo === 'video' && (
          <>
            <CampoTexto
              valor={bloco.titulo ?? ''}
              onSalvar={v => patch({ titulo: v || null })}
              placeholder="Título do vídeo (opcional)"
            />
            <CampoTexto
              valor={bloco.url ?? ''}
              onSalvar={v => patch({ url: v.trim() || null })}
              placeholder="https://www.youtube.com/watch?v=…"
            />
            {bloco.url && !embed && (
              <p className="text-[11.5px] text-urg-highFg">
                Não reconhecemos esse link como vídeo. Cole a URL da página do vídeo no YouTube.
              </p>
            )}
          </>
        )}

        {bloco.tipo === 'imagem' && (
          <>
            <CampoTexto
              valor={bloco.url ?? ''}
              onSalvar={v => patch({ url: v.trim() || null })}
              placeholder="https://… (URL da imagem)"
            />
            <CampoTexto
              valor={bloco.conteudo ?? ''}
              onSalvar={v => patch({ conteudo: v || null })}
              placeholder="Legenda (opcional)"
            />
          </>
        )}

        {bloco.tipo === 'html' && (
          <>
            <CampoTexto
              valor={bloco.conteudo ?? ''}
              onSalvar={v => patch({ conteudo: v || null })}
              placeholder="<p>Conteúdo já pronto em HTML…</p>"
              multilinha
              linhas={7}
              mono
            />
            <p className="text-[11px] text-ink-muted">
              Use só para colar conteúdo que já existe em HTML. Para escrever do zero, prefira
              Título / Parágrafo / Destaque — eles ficam certos sozinhos no celular e no modo escuro.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Questões ─────────────────────────────────────────────────────────────────

function EditorQuestao({
  questao, blocos, numero,
}: {
  questao: QuestaoAdmin
  blocos: BlocoAdmin[]
  numero: number
}) {
  const salvar = useSalvarQuestao()
  const excluir = useExcluirQuestao()

  function patch(campos: Partial<QuestaoAdmin>) {
    salvar.mutate({ id: questao.id, etapa_id: questao.etapa_id, ...campos }, {
      onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.'),
    })
  }

  function trocarTipo(tipo: TipoQuestaoAdmin) {
    if (tipo === 'verdadeiro_falso') {
      patch({ tipo, opcoes: ['Verdadeiro', 'Falso'], corretas: [0] })
    } else if (tipo === 'dissertativa') {
      patch({ tipo, opcoes: [], corretas: [] })
    } else {
      const opcoes = questao.opcoes.length >= 2 ? questao.opcoes : ['', '', '', '']
      // Múltipla escolha aceita uma correta só — corta o excedente ao trocar.
      const corretas = tipo === 'multipla_escolha' ? questao.corretas.slice(0, 1) : questao.corretas
      patch({ tipo, opcoes, corretas })
    }
  }

  function alternarCorreta(i: number) {
    if (questao.tipo === 'multipla_selecao') {
      const novas = questao.corretas.includes(i)
        ? questao.corretas.filter(x => x !== i)
        : [...questao.corretas, i].sort((a, b) => a - b)
      patch({ corretas: novas })
    } else {
      patch({ corretas: [i] })
    }
  }

  const objetiva = questao.tipo !== 'dissertativa'
  const semGabarito = objetiva && questao.corretas.length === 0

  return (
    <div className="space-y-2.5 rounded-xl border border-line-soft bg-surface-subtle/40 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-2 w-5 flex-shrink-0 text-[11px] font-semibold tabular-nums text-ink-subtle">
          {numero}
        </span>
        <div className="min-w-0 flex-1">
          <CampoTexto
            valor={questao.enunciado}
            onSalvar={v => patch({ enunciado: v })}
            placeholder="Enunciado da pergunta"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (!confirm('Excluir esta questão? As respostas dadas a ela também somem.')) return
            excluir.mutate(questao.id, { onError: () => toast.error('Não foi possível excluir.') })
          }}
          className="btn-press mt-1 rounded p-1 text-ink-muted hover:bg-surface-canvas hover:text-urg-highFg"
          title="Excluir questão"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="pl-7">
        <select
          value={questao.tipo}
          onChange={e => trocarTipo(e.target.value as TipoQuestaoAdmin)}
          title={TIPOS_QUESTAO.find(t => t.id === questao.tipo)?.dica}
          className="h-7 rounded-lg border border-line bg-surface-canvas px-2 text-[12px] font-medium text-ink focus:border-accentBlue focus:outline-none"
        >
          {TIPOS_QUESTAO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      {objetiva && (
        <div className="space-y-1.5 pl-7">
          {questao.opcoes.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type={questao.tipo === 'multipla_selecao' ? 'checkbox' : 'radio'}
                name={`correta-${questao.id}`}
                checked={questao.corretas.includes(i)}
                onChange={() => alternarCorreta(i)}
                title="Marcar como correta"
                className="h-3.5 w-3.5 flex-shrink-0 accent-current"
              />
              <div className="min-w-0 flex-1">
                <CampoTexto
                  valor={opt}
                  onSalvar={v => patch({ opcoes: questao.opcoes.map((o, j) => (j === i ? v : o)) })}
                  placeholder={`Alternativa ${String.fromCharCode(65 + i)}`}
                />
              </div>
              {questao.opcoes.length > 2 && questao.tipo !== 'verdadeiro_falso' && (
                <button
                  type="button"
                  onClick={() => patch({
                    opcoes: questao.opcoes.filter((_, j) => j !== i),
                    // Reindexa o gabarito: quem vinha depois da removida anda um pra trás.
                    corretas: questao.corretas.filter(c => c !== i).map(c => (c > i ? c - 1 : c)),
                  })}
                  className="btn-press flex-shrink-0 rounded p-1 text-ink-muted hover:text-urg-highFg"
                  title="Remover alternativa"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}

          {questao.tipo !== 'verdadeiro_falso' && (
            <button
              type="button"
              onClick={() => patch({ opcoes: [...questao.opcoes, ''] })}
              className="btn-press flex items-center gap-1 text-[11.5px] text-ink-muted hover:text-ink-secondary"
            >
              <Plus className="h-3 w-3" /> Alternativa
            </button>
          )}

          <p className={cn('text-[11px]', semGabarito ? 'text-urg-highFg' : 'text-ink-muted')}>
            {semGabarito
              ? 'Marque a alternativa correta — sem gabarito, ninguém passa nesta questão.'
              : questao.tipo === 'multipla_selecao'
                ? 'Marque TODAS as alternativas corretas.'
                : 'Marque o círculo da alternativa correta.'}
          </p>
        </div>
      )}

      <div className="space-y-2 pl-7">
        <label className="flex flex-col gap-1">
          <Rotulo>Explicação (aparece depois de responder)</Rotulo>
          <CampoTexto
            valor={questao.explicacao ?? ''}
            onSalvar={v => patch({ explicacao: v || null })}
            multilinha
            linhas={2}
            placeholder="Opcional — o porquê da resposta certa."
          />
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <Rotulo>Aparece depois de</Rotulo>
            <select
              value={questao.bloco_id ?? ''}
              onChange={e => patch({ bloco_id: e.target.value || null })}
              className={cn(INPUT, 'h-8 w-[190px] py-0 text-[12px]')}
            >
              <option value="">No fim da etapa</option>
              {blocos.map((b, i) => (
                <option key={b.id} value={b.id}>
                  {i + 1}. {b.titulo || b.conteudo?.slice(0, 28) || TIPO_POR_ID[b.tipo]?.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <Rotulo>Peso</Rotulo>
            <input
              type="number"
              min={1}
              value={questao.peso}
              onChange={e => patch({ peso: Math.max(1, Number(e.target.value) || 1) })}
              className={cn(INPUT, 'h-8 w-16 py-0 text-[12px]')}
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-[12px] text-ink-secondary">
            <input
              type="checkbox"
              checked={questao.obrigatoria}
              onChange={e => patch({ obrigatoria: e.target.checked })}
              className="h-3.5 w-3.5 accent-current"
            />
            Obrigatória
          </label>
        </div>
      </div>
    </div>
  )
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function Preview({
  blocos, questoes, notaMinima,
}: {
  blocos: BlocoAdmin[]
  questoes: QuestaoAdmin[]
  notaMinima: number
}) {
  if (blocos.length === 0 && questoes.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-[12.5px] text-ink-muted">
        Nada para mostrar ainda. Adicione um elemento ao lado.
      </p>
    )
  }

  const porBloco = new Map<string, QuestaoAdmin[]>()
  const soltas: QuestaoAdmin[] = []
  for (const q of questoes) {
    if (q.bloco_id) porBloco.set(q.bloco_id, [...(porBloco.get(q.bloco_id) ?? []), q])
    else soltas.push(q)
  }
  const numeroDe = new Map(questoes.map((q, i) => [q.id, i + 1]))

  function questaoPreview(q: QuestaoAdmin) {
    return (
      <div key={q.id} className="rounded-xl border border-line-soft bg-surface-subtle/40 p-3">
        <p className="text-[12.5px] font-medium text-ink">
          {numeroDe.get(q.id)}. {q.enunciado || <span className="text-ink-subtle">(sem enunciado)</span>}
        </p>
        {q.tipo === 'dissertativa' ? (
          <p className="mt-1.5 rounded-lg border border-line-soft bg-surface-canvas px-2.5 py-3 text-[12px] text-ink-subtle">
            Resposta escrita…
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {q.opcoes.map((o, j) => (
              <li key={j} className="flex items-center gap-2 rounded-lg border border-line-soft bg-surface-canvas px-2.5 py-1.5 text-[12px] text-ink-secondary">
                <span className="text-[10px] font-semibold text-ink-muted">{String.fromCharCode(65 + j)}</span>
                {o || <span className="text-ink-subtle">(vazia)</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5 rounded-2xl border border-line-soft bg-surface-canvas px-5 py-5">
      {blocos.map(b => (
        <div key={b.id} className="space-y-3">
          <BlocoView bloco={{
            id: b.id, ordem: b.ordem, tipo: b.tipo,
            titulo: b.titulo, conteudo: b.conteudo, url: b.url, meta: b.meta,
          }} />
          {(porBloco.get(b.id) ?? []).map(questaoPreview)}
        </div>
      ))}

      {soltas.length > 0 && (
        <div className="space-y-2 border-t border-line-soft pt-4">
          <p className="text-[13px] font-semibold text-ink">Atividade da etapa</p>
          <p className="text-[11.5px] text-ink-muted">
            Acerte ao menos {notaMinima}% para liberar a próxima etapa.
          </p>
          {soltas.map(questaoPreview)}
        </div>
      )}
    </div>
  )
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

export function EditarEtapaDialog({
  etapa, onFechar,
}: {
  etapa: EtapaAdmin
  onFechar: () => void
}) {
  const { data: blocos = [] } = useBlocosAdmin(etapa.id)
  const { data: questoes = [] } = useQuestoesAdmin(etapa.id)
  const salvarBloco = useSalvarBloco()
  const salvarQuestao = useSalvarQuestao()
  // Abaixo de lg não cabem duas colunas — vira um par de abas.
  const [painel, setPainel] = useState<'editar' | 'preview'>('editar')

  function novoElemento(tipo: TipoBlocoAdmin) {
    salvarBloco.mutate(
      {
        etapa_id: etapa.id,
        tipo,
        ordem: (blocos.at(-1)?.ordem ?? -1) + 1,
        meta: tipo === 'callout' ? { calloutVariant: 'info' } : {},
      },
      { onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível adicionar.') },
    )
  }

  function novaQuestao() {
    salvarQuestao.mutate(
      {
        etapa_id: etapa.id,
        ordem: (questoes.at(-1)?.ordem ?? -1) + 1,
        tipo: 'multipla_escolha',
        enunciado: '',
        opcoes: ['', '', '', ''],
        corretas: [0],
      },
      { onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível adicionar.') },
    )
  }

  /** Troca dois elementos de lugar. Sem RPC: `ordem` não é única aqui, então
   *  dois updates independentes bastam. */
  function moverElemento(indice: number, direcao: -1 | 1) {
    const a = blocos[indice]
    const b = blocos[indice + direcao]
    if (!a || !b) return
    salvarBloco.mutate({ id: a.id, etapa_id: etapa.id, ordem: b.ordem })
    salvarBloco.mutate({ id: b.id, etapa_id: etapa.id, ordem: a.ordem })
  }

  return (
    <Dialog open onOpenChange={aberto => { if (!aberto) onFechar() }}>
      {/* sm:max-w-* e não max-w-*: o DialogContent do projeto embute
          `sm:max-w-sm`, e o tailwind-merge não trata prefixos diferentes como
          conflito — um `max-w-6xl` sem prefixo é vencido a partir de 640px. */}
      <DialogContent className="flex h-[88vh] max-h-[88vh] w-[min(96vw,80rem)] max-w-[min(96vw,80rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,80rem)]">
        <DialogHeader className="flex-shrink-0 border-b border-line-soft px-5 py-3.5">
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle className="truncate text-[15px]">
              Etapa {etapa.ordem} · {etapa.titulo || 'Sem título'}
            </DialogTitle>

            <div className="flex flex-shrink-0 items-center gap-1 lg:hidden">
              {(['editar', 'preview'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPainel(p)}
                  className={cn(
                    'btn-press flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors',
                    painel === p ? 'bg-ink text-ink-inverse' : 'text-ink-muted hover:bg-surface-subtle',
                  )}
                >
                  {p === 'editar' ? <PanelLeft className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {p === 'editar' ? 'Editar' : 'Prévia'}
                </button>
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          {/* Editor */}
          <div className={cn(
            'min-w-0 space-y-5 overflow-y-auto px-5 py-4 lg:border-r lg:border-line-soft',
            painel === 'preview' && 'hidden lg:block',
          )}>
            <section className="space-y-3">
              <h3 className="text-[13px] font-semibold text-ink">Conteúdo</h3>

              {blocos.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-ink-muted">
                  Etapa vazia. Comece por um título ou um parágrafo.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {blocos.map((b, i) => (
                    <EditorElemento
                      key={b.id}
                      bloco={b}
                      numero={i + 1}
                      primeiro={i === 0}
                      ultimo={i === blocos.length - 1}
                      onMover={d => moverElemento(i, d)}
                    />
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 rounded-xl border border-dashed border-line px-3 py-2.5">
                <span className="w-full pb-0.5 text-[10.5px] font-medium uppercase tracking-wide text-ink-muted">
                  Adicionar elemento
                </span>
                {TIPOS_ELEMENTO.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    title={t.dica}
                    onClick={() => novoElemento(t.id)}
                    className="btn-press flex items-center gap-1 rounded-full border border-line bg-surface-canvas px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary hover:border-ink/20 hover:text-ink"
                  >
                    <t.icone className="h-3 w-3" /> {t.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3 border-t border-line-soft pt-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <ListChecks className="h-4 w-4 text-ink-muted" /> Atividades
                </h3>
                <Button
                  size="sm" variant="outline"
                  className="btn-press h-7 gap-1 border-line px-2 text-[11.5px]"
                  onClick={novaQuestao}
                >
                  <Plus className="h-3 w-3" /> Questão
                </Button>
              </div>

              {questoes.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-ink-muted">
                  Sem atividades: a etapa conclui assim que o professor abrir.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {questoes.map((q, i) => (
                    <EditorQuestao key={q.id} questao={q} blocos={blocos} numero={i + 1} />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Preview — mesmo componente que o professor vê */}
          <div className={cn(
            'min-w-0 overflow-y-auto bg-surface-app px-5 py-4',
            painel === 'editar' && 'hidden lg:block',
          )}>
            <p className="mb-3 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-label text-ink-muted">
              <Eye className="h-3.5 w-3.5" /> Como o professor vê
            </p>
            <Preview blocos={blocos} questoes={questoes} notaMinima={etapa.nota_minima} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
