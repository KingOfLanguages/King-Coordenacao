import { useRef, useState } from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import {
  Plus, Trash2, ChevronUp, ChevronDown, Type, Video, Image as ImageIcon,
  AlertTriangle, ListChecks, Eye, Heading1, Heading2, Code2, PanelLeft,
  List, MousePointerClick, Quote, Minus, Copy, Upload, ImagePlus,
  GripVertical, Images, Film,
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
  linkExterno, botaoEstilo, divisorEstilo, imagensDaGaleria, galeriaColunas,
  type GaleriaImagem,
} from '@/pages/welcomePath/blocoExtras'
import {
  useBlocosAdmin, useQuestoesAdmin, useSalvarBloco, useExcluirBloco, useInserirBloco,
  useReordenarBlocos, useSalvarQuestao, useExcluirQuestao,
  uploadImagemWelcomePath, uploadVideoWelcomePath,
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
  { id: 'h1',      label: 'Título',    icone: Heading1,          dica: 'Título de uma seção do conteúdo.' },
  { id: 'h2',      label: 'Subtítulo', icone: Heading2,          dica: 'Divisão dentro de uma seção.' },
  { id: 'text',    label: 'Parágrafo', icone: Type,              dica: 'Texto corrido. Quebras de linha são respeitadas.' },
  { id: 'lista',   label: 'Lista',     icone: List,              dica: 'Lista com marcadores ou numerada — um item por linha.' },
  { id: 'citacao', label: 'Citação',   icone: Quote,             dica: 'Destaca uma frase ou depoimento.' },
  { id: 'video',   label: 'Vídeo',     icone: Video,             dica: 'YouTube, Vimeo ou arquivo .mp4.' },
  { id: 'imagem',  label: 'Imagem',    icone: ImageIcon,         dica: 'Print de tela ou foto — envie o arquivo ou cole uma URL.' },
  { id: 'galeria', label: 'Galeria',   icone: Images,            dica: 'Várias imagens lado a lado, em 2 ou 3 colunas.' },
  { id: 'callout', label: 'Destaque',  icone: AlertTriangle,     dica: 'Caixa colorida — informação, atenção ou alerta.' },
  { id: 'botao',   label: 'Botão',     icone: MousePointerClick, dica: 'Botão que leva a um link — planilha, formulário, material.' },
  { id: 'divisor', label: 'Divisor',   icone: Minus,             dica: 'Linha, pontos ou espaço para separar seções.' },
  { id: 'html',    label: 'HTML',      icone: Code2,             dica: 'Escotilha de fuga: só para conteúdo já pronto em HTML.' },
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

// ─── Imagem: upload ou URL ────────────────────────────────────────────────────
// Antes o bloco de imagem só aceitava colar uma URL — o que obriga a hospedar o
// print em outro lugar primeiro. Aqui dá para enviar o arquivo direto (bucket
// welcome-path) OU colar a URL, o que for mais prático. Componente à parte por
// causa do estado próprio de upload (arraste, "enviando…").

function EditorImagem({
  bloco, patch,
}: {
  bloco: BlocoAdmin
  patch: (campos: Partial<BlocoAdmin>) => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function enviar(file: File | null | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    setEnviando(true)
    try {
      patch({ url: await uploadImagemWelcomePath(file) })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível enviar a imagem.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-2">
      {bloco.url ? (
        <div className="flex items-start gap-3">
          <img src={bloco.url} alt="" className="h-20 w-20 flex-shrink-0 rounded-lg border border-line object-cover" />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button" disabled={enviando} onClick={() => inputRef.current?.click()}
              className="btn-press inline-flex items-center gap-1 rounded-lg border border-line bg-surface-canvas px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary hover:text-ink disabled:opacity-50"
            >
              <Upload className="h-3 w-3" /> {enviando ? 'Enviando…' : 'Trocar'}
            </button>
            <button
              type="button" onClick={() => patch({ url: null })}
              className="btn-press inline-flex items-center gap-1 rounded-lg border border-line bg-surface-canvas px-2.5 py-1 text-[11.5px] font-medium text-ink-muted hover:text-urg-highFg"
            >
              <Trash2 className="h-3 w-3" /> Remover
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={enviando}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={e => { e.preventDefault(); setArrastando(false); enviar(e.dataTransfer.files?.[0]) }}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-5 text-center transition-colors',
            arrastando ? 'border-accentBlue bg-accentBlue-soft' : 'border-line hover:border-ink-muted',
          )}
        >
          {enviando ? (
            <span className="text-[12px] text-ink-muted">Enviando…</span>
          ) : (
            <>
              <ImagePlus className="h-5 w-5 text-ink-muted" />
              <span className="text-[12px] font-medium text-ink-secondary">Enviar imagem</span>
              <span className="text-[10.5px] text-ink-subtle">arraste aqui ou clique · PNG, JPG, WEBP, GIF</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
        onChange={e => { enviar(e.target.files?.[0]); e.target.value = '' }}
      />

      <CampoTexto
        valor={bloco.url ?? ''}
        onSalvar={v => patch({ url: v.trim() || null })}
        placeholder="ou cole a URL de uma imagem (https://…)"
      />
      <CampoTexto
        valor={bloco.conteudo ?? ''}
        onSalvar={v => patch({ conteudo: v || null })}
        placeholder="Legenda (opcional)"
      />
    </div>
  )
}

// ─── Área de upload compartilhada ───────────────────────────────────────────────
// Arraste-ou-clique reusado pelo vídeo e pela galeria. O upload em si mora no
// hook; aqui é só o gesto e o estado visual de "enviando".

function Dropzone({
  accept, multiple, enviando, onArquivos, icone: Icone, titulo, hint,
}: {
  accept: string
  multiple?: boolean
  enviando: boolean
  onArquivos: (files: FileList | null) => void
  icone: typeof ImagePlus
  titulo: string
  hint: string
}) {
  const [arrastando, setArrastando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type="button"
        disabled={enviando}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={e => { e.preventDefault(); setArrastando(false); onArquivos(e.dataTransfer.files) }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-5 text-center transition-colors',
          arrastando ? 'border-accentBlue bg-accentBlue-soft' : 'border-line hover:border-ink-muted',
        )}
      >
        {enviando ? (
          <span className="text-[12px] text-ink-muted">Enviando…</span>
        ) : (
          <>
            <Icone className="h-5 w-5 text-ink-muted" />
            <span className="text-[12px] font-medium text-ink-secondary">{titulo}</span>
            <span className="text-[10.5px] text-ink-subtle">{hint}</span>
          </>
        )}
      </button>
      <input
        ref={inputRef} type="file" accept={accept} multiple={multiple} hidden
        onChange={e => { onArquivos(e.target.files); e.target.value = '' }}
      />
    </>
  )
}

// ─── Vídeo: upload ou link ──────────────────────────────────────────────────────
// Continua aceitando link (YouTube/Vimeo/.mp4); agora também envia o arquivo pro
// bucket welcome-path-video. O videoEmbed reconhece a URL .mp4 e o portal toca
// num <video> nativo — mesmo caminho de um link de arquivo colado.

function EditorVideo({
  bloco, patch,
}: {
  bloco: BlocoAdmin
  patch: (campos: Partial<BlocoAdmin>) => void
}) {
  const [enviando, setEnviando] = useState(false)
  const embed = videoEmbed(bloco.url)
  const arquivoProprio = embed?.provedor === 'arquivo'

  async function enviar(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('video/')) { toast.error('Selecione um arquivo de vídeo.'); return }
    setEnviando(true)
    try {
      patch({ url: await uploadVideoWelcomePath(file) })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível enviar o vídeo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-2">
      <CampoTexto
        valor={bloco.titulo ?? ''}
        onSalvar={v => patch({ titulo: v || null })}
        placeholder="Título do vídeo (opcional)"
      />

      {arquivoProprio ? (
        <div className="flex items-start gap-3">
          <video src={embed!.src} muted className="h-20 w-32 flex-shrink-0 rounded-lg border border-line bg-black object-cover" />
          <button
            type="button" onClick={() => patch({ url: null })}
            className="btn-press inline-flex items-center gap-1 rounded-lg border border-line bg-surface-canvas px-2.5 py-1 text-[11.5px] font-medium text-ink-muted hover:text-urg-highFg"
          >
            <Trash2 className="h-3 w-3" /> Remover vídeo
          </button>
        </div>
      ) : !embed ? (
        <Dropzone
          accept="video/mp4,video/webm,video/ogg" enviando={enviando} onArquivos={enviar}
          icone={Film} titulo="Enviar vídeo" hint="arraste aqui ou clique · MP4, WEBM · até 50 MB"
        />
      ) : null}

      <CampoTexto
        valor={bloco.url ?? ''}
        onSalvar={v => patch({ url: v.trim() || null })}
        placeholder="ou cole o link do YouTube, Vimeo ou .mp4"
      />
      {bloco.url && !embed && (
        <p className="text-[11.5px] text-urg-highFg">
          Não reconhecemos esse link como vídeo. Cole a URL da página do vídeo no YouTube.
        </p>
      )}
    </div>
  )
}

// ─── Galeria: várias imagens em grade ───────────────────────────────────────────
// As imagens ficam em meta.imagens [{url, legenda?}]; a coluna `url` do bloco não
// é usada. Upload em lote (várias de uma vez), reordenar e legenda por imagem.

function EditorGaleria({
  bloco, patch,
}: {
  bloco: BlocoAdmin
  patch: (campos: Partial<BlocoAdmin>) => void
}) {
  const [enviando, setEnviando] = useState(false)
  const imagens = imagensDaGaleria(bloco.meta)

  function gravar(next: GaleriaImagem[]) {
    patch({ meta: { ...bloco.meta, imagens: next } })
  }

  async function enviar(files: FileList | null) {
    const lista = Array.from(files ?? []).filter(f => f.type.startsWith('image/'))
    if (!lista.length) return
    setEnviando(true)
    try {
      const urls = await Promise.all(lista.map(uploadImagemWelcomePath))
      gravar([...imagens, ...urls.map(url => ({ url }))])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível enviar as imagens.')
    } finally {
      setEnviando(false)
    }
  }

  function mover(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= imagens.length) return
    const next = [...imagens]
    ;[next[i], next[j]] = [next[j], next[i]]
    gravar(next)
  }

  return (
    <div className="space-y-2">
      {imagens.length > 0 && (
        <div className="space-y-1.5">
          {imagens.map((im, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-line-soft bg-surface-canvas p-1.5">
              <img src={im.url} alt="" className="h-12 w-12 flex-shrink-0 rounded-md border border-line object-cover" />
              <div className="min-w-0 flex-1">
                <CampoTexto
                  valor={im.legenda ?? ''}
                  onSalvar={v => gravar(imagens.map((x, j) => (j === i ? { ...x, legenda: v || undefined } : x)))}
                  placeholder="Legenda (opcional)"
                />
              </div>
              <div className="flex flex-shrink-0">
                <button type="button" disabled={i === 0} onClick={() => mover(i, -1)}
                  className="btn-press rounded p-1 text-ink-muted hover:text-ink disabled:opacity-30" title="Subir">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" disabled={i === imagens.length - 1} onClick={() => mover(i, 1)}
                  className="btn-press rounded p-1 text-ink-muted hover:text-ink disabled:opacity-30" title="Descer">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => gravar(imagens.filter((_, j) => j !== i))}
                  className="btn-press rounded p-1 text-ink-muted hover:text-urg-highFg" title="Remover">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dropzone
        accept="image/png,image/jpeg,image/webp,image/gif" multiple enviando={enviando} onArquivos={enviar}
        icone={ImagePlus}
        titulo={imagens.length ? 'Adicionar mais imagens' : 'Enviar imagens'}
        hint="arraste aqui ou clique · várias de uma vez"
      />

      <label className="flex items-center gap-2 text-[12px] text-ink-secondary">
        Colunas
        <select
          value={galeriaColunas(bloco.meta)}
          onChange={e => patch({ meta: { ...bloco.meta, colunas: Number(e.target.value) } })}
          className="h-7 rounded-lg border border-line bg-surface-canvas px-2 text-[12px] text-ink focus:border-accentBlue focus:outline-none"
        >
          <option value={2}>2 colunas</option>
          <option value={3}>3 colunas</option>
        </select>
      </label>
    </div>
  )
}

// ─── Inserir elemento em qualquer posição ──────────────────────────────────────
// O editor antigo só sabia acrescentar no fim e subir de um em um. Este é um
// alvo fino entre os blocos: passa o mouse, aparece um "+", escolhe o tipo e o
// elemento nasce ali (via wp_inserir_bloco, que abre espaço no `ordem`).

function InseridorBloco({ onInserir }: { onInserir: (tipo: TipoBlocoAdmin) => void }) {
  const [aberto, setAberto] = useState(false)
  const hairline = cn(
    'h-px flex-1 bg-line transition-opacity',
    aberto ? 'opacity-100' : 'opacity-0 group-hover/ins:opacity-100',
  )
  return (
    <div className="group/ins relative -my-1 flex h-4 items-center">
      <div className={hairline} />
      <PopoverPrimitive.Root open={aberto} onOpenChange={setAberto}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            title="Inserir elemento aqui"
            className={cn(
              'btn-press mx-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-line bg-surface-canvas text-ink-muted transition-opacity hover:border-ink/25 hover:text-ink',
              aberto ? 'opacity-100' : 'opacity-0 group-hover/ins:opacity-100',
            )}
          >
            <Plus className="h-3 w-3" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="center" sideOffset={6} collisionPadding={12}
            className="z-[60] w-52 rounded-xl bg-popover p-1 text-popover-foreground shadow-popover ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
          >
            <p className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
              Inserir aqui
            </p>
            <div className="max-h-[50vh] overflow-y-auto">
              {TIPOS_ELEMENTO.map(t => (
                <button
                  key={t.id}
                  type="button"
                  title={t.dica}
                  onClick={() => { onInserir(t.id); setAberto(false) }}
                  className="btn-press flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-ink-secondary hover:bg-surface-subtle hover:text-ink"
                >
                  <t.icone className="h-3.5 w-3.5 flex-shrink-0 text-ink-muted" /> {t.label}
                </button>
              ))}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      <div className={hairline} />
    </div>
  )
}

// ─── Elemento de conteúdo ─────────────────────────────────────────────────────

function EditorElemento({
  bloco, primeiro, ultimo, numero, onMover, onDuplicar, dnd,
}: {
  bloco: BlocoAdmin
  primeiro: boolean
  ultimo: boolean
  numero: number
  onMover: (direcao: -1 | 1) => void
  onDuplicar: () => void
  dnd: {
    onDragStart: () => void
    onDragEnter: () => void
    onDragEnd: () => void
    onDrop: () => void
    arrastando: boolean
    alvo: boolean
  }
}) {
  const salvar = useSalvarBloco()
  const excluir = useExcluirBloco()
  const rowRef = useRef<HTMLDivElement>(null)

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

  return (
    <div
      ref={rowRef}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
      onDragEnter={dnd.onDragEnter}
      onDrop={e => { e.preventDefault(); dnd.onDrop() }}
      className={cn(
        'rounded-xl border border-line-soft bg-surface-subtle/40 p-3 transition-shadow',
        dnd.arrastando && 'opacity-40',
        dnd.alvo && 'ring-2 ring-accentBlue ring-offset-2 ring-offset-surface-app',
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          draggable
          onDragStart={e => {
            e.dataTransfer.effectAllowed = 'move'
            if (rowRef.current) e.dataTransfer.setDragImage(rowRef.current, 20, 20)
            dnd.onDragStart()
          }}
          onDragEnd={dnd.onDragEnd}
          title="Arraste para reordenar"
          className="btn-press flex-shrink-0 cursor-grab rounded p-0.5 text-ink-subtle hover:text-ink active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

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
          <button type="button" onClick={onDuplicar}
            className="btn-press rounded p-1 text-ink-muted hover:bg-surface-canvas hover:text-ink" title="Duplicar">
            <Copy className="h-3.5 w-3.5" />
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

        {bloco.tipo === 'video' && <EditorVideo bloco={bloco} patch={patch} />}

        {bloco.tipo === 'imagem' && <EditorImagem bloco={bloco} patch={patch} />}

        {bloco.tipo === 'galeria' && <EditorGaleria bloco={bloco} patch={patch} />}

        {bloco.tipo === 'lista' && (
          <>
            <label className="flex items-center gap-2 text-[12px] text-ink-secondary">
              <input
                type="checkbox"
                checked={bloco.meta?.ordered === true}
                onChange={e => patch({ meta: { ...bloco.meta, ordered: e.target.checked } })}
                className="h-3.5 w-3.5 accent-current"
              />
              Lista numerada (1, 2, 3…)
            </label>
            <CampoTexto
              valor={bloco.conteudo ?? ''}
              onSalvar={v => patch({ conteudo: v || null })}
              placeholder={'Um item por linha:\nPrimeiro item\nSegundo item'}
              multilinha
              linhas={4}
            />
          </>
        )}

        {bloco.tipo === 'citacao' && (
          <>
            <CampoTexto
              valor={bloco.conteudo ?? ''}
              onSalvar={v => patch({ conteudo: v || null })}
              placeholder="A frase ou depoimento…"
              multilinha
              linhas={3}
            />
            <CampoTexto
              valor={bloco.titulo ?? ''}
              onSalvar={v => patch({ titulo: v || null })}
              placeholder="Autor / fonte (opcional)"
            />
          </>
        )}

        {bloco.tipo === 'botao' && (
          <>
            <CampoTexto
              valor={bloco.titulo ?? ''}
              onSalvar={v => patch({ titulo: v || null })}
              placeholder="Texto do botão (ex.: Acessar a planilha)"
            />
            <CampoTexto
              valor={bloco.url ?? ''}
              onSalvar={v => patch({ url: v.trim() || null })}
              placeholder="https://… (para onde o botão leva)"
            />
            {bloco.url && !linkExterno(bloco.url) && (
              <p className="text-[11.5px] text-urg-highFg">Link inválido — o endereço precisa começar com https://</p>
            )}
            <select
              value={botaoEstilo(bloco.meta)}
              onChange={e => patch({ meta: { ...bloco.meta, estilo: e.target.value } })}
              className="h-7 rounded-lg border border-line bg-surface-canvas px-2 text-[12px] text-ink focus:border-accentBlue focus:outline-none"
            >
              <option value="primario">Botão preenchido</option>
              <option value="secundario">Botão contornado</option>
            </select>
          </>
        )}

        {bloco.tipo === 'divisor' && (
          <select
            value={divisorEstilo(bloco.meta)}
            onChange={e => patch({ meta: { ...bloco.meta, estilo: e.target.value } })}
            className="h-7 rounded-lg border border-line bg-surface-canvas px-2 text-[12px] text-ink focus:border-accentBlue focus:outline-none"
          >
            <option value="linha">Linha</option>
            <option value="pontos">Pontos</option>
            <option value="espaco">Espaço em branco</option>
          </select>
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
  const inserirBloco = useInserirBloco()
  const reordenarBlocos = useReordenarBlocos()
  const salvarQuestao = useSalvarQuestao()
  // Abaixo de lg não cabem duas colunas — vira um par de abas.
  const [painel, setPainel] = useState<'editar' | 'preview'>('editar')
  // Arrastar-e-soltar: qual índice está sendo arrastado e sobre qual passa.
  const [arrastadoIdx, setArrastadoIdx] = useState<number | null>(null)
  const [sobreIdx, setSobreIdx] = useState<number | null>(null)

  /** Estado inicial de `meta` por tipo. */
  function metaInicial(tipo: TipoBlocoAdmin): Record<string, unknown> {
    if (tipo === 'callout') return { calloutVariant: 'info' }
    if (tipo === 'lista')   return { ordered: false }
    if (tipo === 'galeria') return { imagens: [], colunas: 2 }
    return {}
  }

  /** Solta o bloco arrastado no índice de destino e grava a ordem toda. */
  function soltarNoIndice(destino: number) {
    const origem = arrastadoIdx
    setSobreIdx(null)
    setArrastadoIdx(null)
    if (origem == null || origem === destino) return
    const nova = [...blocos]
    const [item] = nova.splice(origem, 1)
    nova.splice(destino, 0, item)
    reordenarBlocos.mutate({ etapa_id: etapa.id, ids: nova.map(b => b.id) })
  }

  /** Insere um elemento. `posicao` é o valor de `ordem` que ele vai ocupar (a RPC
   *  empurra o resto pra frente); sem posicao, cai no fim. */
  function inserirElemento(tipo: TipoBlocoAdmin, posicao?: number) {
    inserirBloco.mutate(
      {
        etapa_id: etapa.id,
        posicao: posicao ?? (blocos.at(-1)?.ordem ?? -1) + 1,
        tipo,
        meta: metaInicial(tipo),
      },
      { onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível adicionar.') },
    )
  }

  /** Duplica um elemento logo abaixo dele, com o mesmo conteúdo. */
  function duplicarElemento(bloco: BlocoAdmin) {
    inserirBloco.mutate(
      {
        etapa_id: etapa.id,
        posicao: bloco.ordem + 1,
        tipo: bloco.tipo,
        titulo: bloco.titulo,
        conteudo: bloco.conteudo,
        url: bloco.url,
        meta: bloco.meta,
      },
      { onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível duplicar.') },
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
                    <div key={b.id} className="space-y-2.5">
                      {/* Alvo de inserção acima deste bloco (o de cima cobre o topo). */}
                      <InseridorBloco onInserir={tipo => inserirElemento(tipo, b.ordem)} />
                      <EditorElemento
                        bloco={b}
                        numero={i + 1}
                        primeiro={i === 0}
                        ultimo={i === blocos.length - 1}
                        onMover={d => moverElemento(i, d)}
                        onDuplicar={() => duplicarElemento(b)}
                        dnd={{
                          onDragStart: () => setArrastadoIdx(i),
                          onDragEnter: () => setSobreIdx(prev => (arrastadoIdx == null ? prev : i)),
                          onDragEnd: () => { setArrastadoIdx(null); setSobreIdx(null) },
                          onDrop: () => soltarNoIndice(i),
                          arrastando: arrastadoIdx === i,
                          alvo: sobreIdx === i && arrastadoIdx != null && arrastadoIdx !== i,
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 rounded-xl border border-dashed border-line px-3 py-2.5">
                <span className="w-full pb-0.5 text-[10.5px] font-medium uppercase tracking-wide text-ink-muted">
                  Adicionar elemento{blocos.length > 0 && ' no fim'}
                </span>
                {TIPOS_ELEMENTO.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    title={t.dica}
                    onClick={() => inserirElemento(t.id)}
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
