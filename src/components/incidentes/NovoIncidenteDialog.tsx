import { useMemo, useState, useEffect, useRef } from 'react'
import { Search, X, GraduationCap, ImagePlus, Info, Flag, FileText, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProfessoresAtivos } from '@/hooks/useProfessores'
import {
  useCriarIncidente, useAlunosDoProfessor, uploadImagemIncidente, categoriasVisiveis,
  CATEGORIAS_PROFESSOR, CATEGORIAS_GERAL, CATEGORIAS_PLATAFORMA, NATUREZA_META,
  type Aba, type Natureza,
} from '@/hooks/useIncidentes'
import { useAuth } from '@/contexts/AuthContext'
import { podeVerCategoriasCoordOnly } from '@/lib/permissions'
import { cn } from '@/lib/utils'

const MAX_IMAGENS = 3

/** Ícone de cada natureza no cartão de escolha do passo 1. */
const NATUREZA_ICON: Record<Natureza, typeof Flag> = {
  desafio: Flag,
  informe: FileText,
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Pré-preenchido quando a ação parte da tela do próprio professor — esconde a aba "geral". */
  professorFixo?: { id: string; nome: string }
}

export function NovoIncidenteDialog({ open, onOpenChange, professorFixo }: Props) {
  const { profile } = useAuth()
  const podeVerCoordOnly = podeVerCategoriasCoordOnly(profile)
  const { data: professores = [] } = useProfessoresAtivos()
  const criar = useCriarIncidente()

  // passo 1 = escolher a intenção (Desafio/Informe); passo 2 = preencher o resto.
  const [passo, setPasso] = useState<1 | 2>(1)
  const [natureza, setNatureza] = useState<Natureza>('desafio')
  const [aba, setAba] = useState<Aba>('professor')
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState<{ id: string; nome: string } | null>(professorFixo ?? null)
  const [tituloLivre, setTituloLivre] = useState('')
  const [alunoNome, setAlunoNome] = useState('')
  const [alunoBusca, setAlunoBusca] = useState(false)
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_PROFESSOR[0])
  const [urgencia, setUrgencia] = useState('Média')
  const [descricao, setDescricao] = useState('')
  const [imagens, setImagens] = useState<File[]>([])
  const [enviandoImagens, setEnviandoImagens] = useState(false)

  const { data: roster = [], isLoading: carregandoRoster } = useAlunosDoProfessor(selecionado?.id ?? null)

  const alunoBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Informe é registro puro — urgência não faz sentido (não segue fluxo de resolução).
  const mostrarUrgencia = natureza === 'desafio'

  // URLs de preview locais — revogadas quando a lista muda ou o diálogo desmonta.
  const previews = useMemo(() => imagens.map(f => URL.createObjectURL(f)), [imagens])
  useEffect(() => () => { previews.forEach(URL.revokeObjectURL) }, [previews])

  function addImagens(files: FileList | null) {
    if (!files) return
    const novas = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!novas.length) return
    setImagens(prev => {
      const combinado = [...prev, ...novas].slice(0, MAX_IMAGENS)
      if (prev.length + novas.length > MAX_IMAGENS) toast.warning(`Máximo de ${MAX_IMAGENS} imagens.`)
      return combinado
    })
  }
  function removeImagem(idx: number) {
    setImagens(prev => prev.filter((_, i) => i !== idx))
  }

  useEffect(() => {
    // Limpa o timeout pendente do onBlur do campo "Aluno" — sem isso, o
    // setState agendado pode disparar depois que o Dialog já começou a
    // fechar/desmontar (Radix ainda está com a animação de saída), o que
    // já causou um crash de removeChild ao registrar incidente.
    return () => {
      if (alunoBlurTimeout.current) clearTimeout(alunoBlurTimeout.current)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      if (alunoBlurTimeout.current) clearTimeout(alunoBlurTimeout.current)
      return
    }
    setPasso(1)
    setNatureza('desafio')
    setAba('professor')
    setSelecionado(professorFixo ?? null)
    setBusca('')
    setTituloLivre('')
    setAlunoNome('')
    setCategoria(CATEGORIAS_PROFESSOR[0])
    setUrgencia('Média')
    setDescricao('')
    setImagens([])
  }, [open, professorFixo])

  const categoriasBase = aba === 'professor' ? CATEGORIAS_PROFESSOR : aba === 'plataforma' ? CATEGORIAS_PLATAFORMA : CATEGORIAS_GERAL
  const categorias = categoriasVisiveis(categoriasBase, podeVerCoordOnly)

  function escolherIntencao(n: Natureza) {
    setNatureza(n)
    setPasso(2)
  }

  function trocarAba(novaAba: Aba) {
    setAba(novaAba)
    const base = novaAba === 'professor' ? CATEGORIAS_PROFESSOR : novaAba === 'plataforma' ? CATEGORIAS_PLATAFORMA : CATEGORIAS_GERAL
    setCategoria(categoriasVisiveis(base, podeVerCoordOnly)[0])
  }

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (termo.length < 2) return []
    return professores.filter(p => p.nome.toLowerCase().includes(termo)).slice(0, 8)
  }, [busca, professores])

  const sugestoesAluno = useMemo(() => {
    const termo = alunoNome.trim().toLowerCase()
    if (!termo) return roster.slice(0, 6)
    return roster.filter(a => a.primeiro_nome.toLowerCase().includes(termo)).slice(0, 6)
  }, [alunoNome, roster])

  const podeConfirmar = !!descricao.trim() && (aba !== 'professor' || !!selecionado)

  async function handleConfirmar() {
    if (!podeConfirmar || criar.isPending || enviandoImagens) return
    if (alunoBlurTimeout.current) clearTimeout(alunoBlurTimeout.current)
    setAlunoBusca(false)
    try {
      let imageUrls: string[] = []
      if (imagens.length) {
        setEnviandoImagens(true)
        imageUrls = await Promise.all(imagens.map(uploadImagemIncidente))
      }
      await criar.mutateAsync({
        problem_type: categoria,
        urgency: mostrarUrgencia ? urgencia : 'Baixa',
        description: descricao.trim(),
        needs_follow_up: false,
        professor_id: aba !== 'geral' ? selecionado?.id : null,
        titulo_livre: aba === 'geral' ? tituloLivre : undefined,
        aluno_nome: alunoNome,
        image_urls: imageUrls,
        natureza,
        ti_status: aba === 'plataforma' ? 'chamado_aberto' : null,
      })
      toast.success(natureza === 'informe' ? 'Informe registrado.' : 'Chamado aberto.')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar incidente.')
    } finally {
      setEnviandoImagens(false)
    }
  }

  const meta = NATUREZA_META[natureza]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-canvas border-line text-ink max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink font-semibold">
            {passo === 1 ? 'Novo incidente' : natureza === 'informe' ? 'Novo informe' : 'Novo chamado'}
          </DialogTitle>
        </DialogHeader>

        {passo === 1 ? (
          <div className="space-y-3">
            <p className="text-[13px] text-ink-secondary">O que você quer fazer?</p>
            {(['desafio', 'informe'] as const).map(n => {
              const m = NATUREZA_META[n]
              const Icone = NATUREZA_ICON[n]
              const ehDesafio = n === 'desafio'
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => escolherIntencao(n)}
                  className={cn(
                    'btn-press w-full text-left rounded-xl border px-4 py-3 transition-colors',
                    'border-line hover:border-accentBlue hover:bg-surface-subtle/40',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icone className={cn('h-4 w-4', ehDesafio ? 'text-accentBlue' : 'text-ink-muted')} />
                    <span className="text-[14px] font-medium text-ink">{m.titulo}</span>
                    <span className={cn(
                      'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10.5px] font-medium',
                      ehDesafio ? 'bg-accentBlue-soft text-accentBlue' : 'bg-surface-muted text-ink-muted',
                    )}>
                      {m.label}
                    </span>
                  </div>
                  <p className="text-[12px] text-ink-secondary mt-1 leading-relaxed">{m.descricao}</p>
                </button>
              )
            })}
          </div>
        ) : (
        <div className="space-y-4">
          {/* Cabeçalho da intenção escolhida — permite voltar e trocar. */}
          <button
            type="button"
            onClick={() => setPasso(1)}
            className="btn-press flex items-center gap-2 text-[12px] text-ink-secondary hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className={cn(
              'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10.5px] font-medium',
              natureza === 'desafio' ? 'bg-accentBlue-soft text-accentBlue' : 'bg-surface-muted text-ink-muted',
            )}>
              {meta.label}
            </span>
            <span>{meta.titulo}</span>
            <span className="text-ink-muted underline underline-offset-2">trocar</span>
          </button>

          {!professorFixo && (
            <div className="flex items-center gap-1 rounded-full bg-surface-subtle p-1 w-fit">
              <button
                onClick={() => trocarAba('professor')}
                className={cn(
                  'btn-press px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all duration-200',
                  aba === 'professor' ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
                )}
              >
                Professor
              </button>
              <button
                onClick={() => trocarAba('geral')}
                className={cn(
                  'btn-press px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all duration-200',
                  aba === 'geral' ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
                )}
              >
                Geral
              </button>
              <button
                onClick={() => trocarAba('plataforma')}
                className={cn(
                  'btn-press px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all duration-200',
                  aba === 'plataforma' ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
                )}
              >
                Plataforma
              </button>
            </div>
          )}

          {aba === 'geral' ? (
            <div className="space-y-1.5">
              <Label className="label-micro">Título / referência (opcional)</Label>
              <Input
                value={tituloLivre}
                onChange={e => setTituloLivre(e.target.value)}
                placeholder={`Ex: ${categoria}`}
                className="h-9 bg-surface-canvas border-line"
              />
              <p className="text-[11px] text-ink-subtle">Sem professor vinculado — aparece na aba geral.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="label-micro">Professor{aba === 'plataforma' ? ' (opcional)' : ''}</Label>
              {professorFixo ? (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-subtle px-3 py-2 text-[13px] text-ink">
                  {professorFixo.nome}
                </div>
              ) : selecionado ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-subtle px-3 py-2 text-[13px] text-ink">
                  {selecionado.nome}
                  <button onClick={() => setSelecionado(null)} className="text-ink-muted hover:text-ink transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
                  <Input
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar professor pelo nome…"
                    className="pl-9 h-9 bg-surface-canvas border-line"
                  />
                  {resultados.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-line bg-surface-canvas shadow-lg">
                      {resultados.map(p => (
                        <li key={p.id}>
                          <button
                            onClick={() => { setSelecionado({ id: p.id, nome: p.nome }); setBusca('') }}
                            className="w-full text-left px-3 py-2 text-[13px] text-ink hover:bg-surface-subtle transition-colors"
                          >
                            {p.nome}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {aba === 'plataforma' && (
            <div className="flex items-start gap-2.5 rounded-lg border border-line-soft bg-surface-subtle/60 px-3.5 py-2.5">
              <Info className="h-3.5 w-3.5 text-accentBlue flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-ink-secondary leading-relaxed">
                Se o bug/melhoria envolve um professor ou aluno específico, selecione-os acima e no campo
                "Aluno" abaixo — isso agiliza o trabalho do TI.
              </p>
            </div>
          )}

          <div className="space-y-1.5 relative">
            <Label className="label-micro flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5 text-ink-muted" />
              Aluno (opcional)
            </Label>
            <Input
              value={alunoNome}
              onChange={e => setAlunoNome(e.target.value)}
              onFocus={() => setAlunoBusca(true)}
              onBlur={() => {
                alunoBlurTimeout.current = setTimeout(() => setAlunoBusca(false), 150)
              }}
              placeholder="Nome do aluno relacionado ao incidente…"
              className="h-9 bg-surface-canvas border-line"
            />
            {alunoBusca && selecionado && sugestoesAluno.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-line bg-surface-canvas shadow-lg">
                {sugestoesAluno.map(a => (
                  <li key={a.aluno_id}>
                    <button
                      onMouseDown={() => setAlunoNome(a.primeiro_nome)}
                      className="w-full text-left px-3 py-2 text-[13px] text-ink hover:bg-surface-subtle transition-colors"
                    >
                      {a.primeiro_nome}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {alunoBusca && selecionado && !carregandoRoster && roster.length === 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-line bg-surface-canvas px-3 py-2 text-[12px] text-ink-muted shadow-lg">
                Nenhum aluno sincronizado pra esse professor ainda — pode digitar o nome manualmente.
              </div>
            )}
          </div>

          {/* min-w-0 nas colunas + w-full no trigger: sem isso o SelectTrigger é
              w-fit e cresce com a categoria longa, invadindo a coluna da urgência.
              Com w-full o valor respeita o line-clamp-1 e trunca dentro da coluna. */}
          <div className={cn('grid gap-2', mostrarUrgencia ? 'grid-cols-2' : 'grid-cols-1')}>
            <div className="space-y-1.5 min-w-0">
              <Label className="label-micro">Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="w-full bg-surface-canvas border-line text-ink">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-canvas border-line text-ink max-h-64">
                  {categorias.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mostrarUrgencia && (
              <div className="space-y-1.5 min-w-0">
                <Label className="label-micro">Urgência</Label>
                <Select value={urgencia} onValueChange={setUrgencia}>
                  <SelectTrigger className="w-full bg-surface-canvas border-line text-ink">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-canvas border-line text-ink">
                    <SelectItem value="Baixa">Baixa</SelectItem>
                    <SelectItem value="Média">Média</SelectItem>
                    <SelectItem value="Alta">Alta</SelectItem>
                    <SelectItem value="Crítico">Crítico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="label-micro">Descrição</Label>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              rows={4}
              className={cn(
                'w-full resize-none rounded-lg border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink',
                'placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue transition-colors',
              )}
              placeholder="O que aconteceu…"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="label-micro">Imagens (opcional · até {MAX_IMAGENS})</Label>
            <div className="flex flex-wrap gap-2">
              {imagens.map((f, i) => (
                <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-line">
                  <img src={previews[i]} alt={f.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImagem(i)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Remover imagem"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {imagens.length < MAX_IMAGENS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-press flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-line text-ink-muted transition-colors hover:border-ink-muted hover:text-ink"
                >
                  <ImagePlus className="h-4 w-4" />
                  <span className="text-[10px]">Adicionar</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={e => { addImagens(e.target.files); e.target.value = '' }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-ink-secondary">
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmar}
              disabled={!podeConfirmar || criar.isPending || enviandoImagens}
              className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
            >
              {enviandoImagens ? 'Enviando imagens…' : criar.isPending ? 'Salvando…' : meta.verbo}
            </Button>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
