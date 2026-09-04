import { useMemo, useState, useEffect, useRef } from 'react'
import { Search, X, GraduationCap, ImagePlus, Info, Flag, FileText, ArrowLeft, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProfessoresAtivos } from '@/hooks/useProfessores'
import {
  useCriarIncidente, useAlunosDoProfessor, useBuscarAlunos, uploadImagemIncidente, categoriasVisiveis,
  CATEGORIAS_PROFESSOR, CATEGORIAS_GERAL, CATEGORIAS_PLATAFORMA, NATUREZA_META,
  type Aba, type Natureza,
} from '@/hooks/useIncidentes'
import { useAuth } from '@/contexts/AuthContext'
import { podeVerCategoriasCoordOnly } from '@/lib/permissions'
import { prazoSugeridoInput, prazoInputParaISO } from '@/lib/incidentePrazo'
import {
  faltasDoRelato, relatoCompletoObrigatorio, datetimeLocalParaISO, agoraDatetimeLocal, idKing,
} from '@/lib/incidenteRelato'
import { cn } from '@/lib/utils'

const MAX_IMAGENS = 3

/** Ícone de cada natureza no cartão de escolha do passo 1. */
const NATUREZA_ICON: Record<Natureza, typeof Flag> = {
  desafio: Flag,
  informe: FileText,
}

/** Selo do ID no King ao lado de um nome — some quando o cadastro não tem ID. */
function IdChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-muted px-1.5 py-0.5 text-[10.5px] font-medium text-ink-muted whitespace-nowrap">
      {children}
    </span>
  )
}

/** Asterisco de campo obrigatório (só onde o relato completo é exigido). */
function Obrigatorio() {
  return <span className="text-urg-critFg" title="Obrigatório">*</span>
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Pré-preenchido quando a ação parte da tela do próprio professor — esconde a aba "geral". */
  professorFixo?: { id: string; nome: string; kms_id?: string | null }
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
  const [selecionado, setSelecionado] = useState<{ id: string; nome: string; kms_id?: string | null } | null>(professorFixo ?? null)
  const [tituloLivre, setTituloLivre] = useState('')
  const [alunoNome, setAlunoNome] = useState('')
  // ID do aluno no King. Preenchido ao escolher na lista (e então `idAutomatico`
  // fica true, pra limpar sozinho se a pessoa trocar o nome depois), ou digitado
  // à mão quando o aluno não está no roster sincronizado.
  const [alunoId, setAlunoId] = useState('')
  const [idAutomatico, setIdAutomatico] = useState(false)
  const [alunoBusca, setAlunoBusca] = useState(false)
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_PROFESSOR[0])
  const [urgencia, setUrgencia] = useState('Média')
  // Prazo sugerido pela urgência, mas editável — `prazoManual` trava a sugestão
  // automática assim que a pessoa mexe no campo.
  const [prazo, setPrazo] = useState(() => prazoSugeridoInput('Média'))
  const [prazoManual, setPrazoManual] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [passos, setPassos] = useState('')
  const [ocorridoEm, setOcorridoEm] = useState('')
  const [imagens, setImagens] = useState<File[]>([])
  const [enviandoImagens, setEnviandoImagens] = useState(false)

  // Na aba Geral o incidente não tem professor, mesmo que um tenha ficado
  // selecionado antes da troca de aba — a sugestão de aluno segue essa regra.
  const professorAtivo = aba === 'geral' ? null : selecionado
  const { data: roster = [], isLoading: carregandoRoster } = useAlunosDoProfessor(professorAtivo?.id ?? null)
  // Sem professor escolhido (aba Geral, ou antes de escolher) a sugestão vem de
  // uma busca no roster inteiro — é o que permite anexar o ID do aluno mesmo
  // num incidente que não é de professor nenhum.
  const { data: alunosGlobais = [] } = useBuscarAlunos(professorAtivo ? '' : alunoNome)

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
    setAlunoId('')
    setIdAutomatico(false)
    setCategoria(CATEGORIAS_PROFESSOR[0])
    setUrgencia('Média')
    setPrazo(prazoSugeridoInput('Média'))
    setPrazoManual(false)
    setDescricao('')
    setPassos('')
    setOcorridoEm('')
    setImagens([])
  }, [open, professorFixo])

  /** Trocar o nome à mão invalida o ID que veio da lista — sem isso o incidente
   *  sairia com o nome de um aluno e o ID de outro. */
  function trocarAlunoNome(valor: string) {
    setAlunoNome(valor)
    if (idAutomatico) { setAlunoId(''); setIdAutomatico(false) }
  }

  function escolherAluno(aluno: { aluno_id: number; primeiro_nome: string }) {
    setAlunoNome(aluno.primeiro_nome)
    setAlunoId(String(aluno.aluno_id))
    setIdAutomatico(true)
  }

  // Troca a urgência e, enquanto o prazo não foi editado à mão, reajusta a sugestão.
  function trocarUrgencia(v: string) {
    setUrgencia(v)
    if (!prazoManual) setPrazo(prazoSugeridoInput(v))
  }

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

  const relatoObrigatorio = relatoCompletoObrigatorio(aba)
  const faltas = faltasDoRelato({ aba, descricao, passos, ocorridoEm })
  if (aba === 'professor' && !selecionado) faltas.push('escolher o professor')
  const podeConfirmar = faltas.length === 0

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
        aluno_id: alunoId.trim() ? Number(alunoId.trim()) : null,
        ocorrido_em: datetimeLocalParaISO(ocorridoEm),
        passos,
        image_urls: imageUrls,
        natureza,
        ti_status: aba === 'plataforma' ? 'chamado_aberto' : null,
        prazo_resolucao: mostrarUrgencia ? prazoInputParaISO(prazo) : null,
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
                  {idKing(professorFixo.kms_id) && <IdChip>King {idKing(professorFixo.kms_id)}</IdChip>}
                </div>
              ) : selecionado ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-subtle px-3 py-2 text-[13px] text-ink">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{selecionado.nome}</span>
                    {idKing(selecionado.kms_id) && <IdChip>King {idKing(selecionado.kms_id)}</IdChip>}
                  </span>
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
                            onClick={() => { setSelecionado({ id: p.id, nome: p.nome, kms_id: p.kms_id }); setBusca('') }}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-surface-subtle transition-colors"
                          >
                            <span className="truncate">{p.nome}</span>
                            {idKing(p.kms_id) && <span className="text-[11px] text-ink-muted">King {idKing(p.kms_id)}</span>}
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
                Se o bug/melhoria envolve um professor ou aluno específico, identifique os dois acima — o TI
                precisa do <strong className="font-medium text-ink">ID do King</strong> pra achar o caso lá.
                Descreva também o passo a passo e a hora exata: é o que evita o chamado voltar pedindo isso.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="label-micro flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5 text-ink-muted" />
              Aluno (opcional)
            </Label>
            {/* Nome + ID lado a lado: escolher na lista preenche os dois; o ID
                fica editável pra quando o aluno não está no roster sincronizado. */}
            <div className="grid grid-cols-[1fr_112px] gap-2">
              <div className="relative">
                <Input
                  value={alunoNome}
                  onChange={e => trocarAlunoNome(e.target.value)}
                  onFocus={() => setAlunoBusca(true)}
                  onBlur={() => {
                    alunoBlurTimeout.current = setTimeout(() => setAlunoBusca(false), 150)
                  }}
                  placeholder="Nome do aluno…"
                  className="h-9 bg-surface-canvas border-line"
                />
                {alunoBusca && professorAtivo && sugestoesAluno.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-line bg-surface-canvas shadow-lg">
                    {sugestoesAluno.map(a => (
                      <li key={a.aluno_id}>
                        <button
                          onMouseDown={() => escolherAluno(a)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-surface-subtle transition-colors"
                        >
                          <span className="truncate">{a.primeiro_nome}</span>
                          <span className="text-[11px] text-ink-muted">King #{a.aluno_id}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {alunoBusca && !professorAtivo && alunosGlobais.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-line bg-surface-canvas shadow-lg">
                    {alunosGlobais.map(a => (
                      <li key={`${a.professor_id}-${a.aluno_id}`}>
                        <button
                          onMouseDown={() => escolherAluno(a)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-surface-subtle transition-colors"
                        >
                          <span className="truncate">
                            {a.primeiro_nome}
                            <span className="text-ink-muted"> · {a.professor_nome}</span>
                          </span>
                          <span className="text-[11px] text-ink-muted whitespace-nowrap">King #{a.aluno_id}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {alunoBusca && professorAtivo && !carregandoRoster && roster.length === 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-line bg-surface-canvas px-3 py-2 text-[12px] text-ink-muted shadow-lg">
                    Nenhum aluno sincronizado pra esse professor ainda — pode digitar o nome e o ID manualmente.
                  </div>
                )}
              </div>
              <Input
                value={alunoId}
                onChange={e => { setAlunoId(e.target.value.replace(/\D/g, '')); setIdAutomatico(false) }}
                inputMode="numeric"
                placeholder="ID King"
                className="h-9 bg-surface-canvas border-line"
              />
            </div>
            <p className="text-[11px] text-ink-subtle">
              Guardamos só o primeiro nome do aluno — é o ID do King que identifica de quem se trata.
            </p>
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
                <Select value={urgencia} onValueChange={trocarUrgencia}>
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

          {mostrarUrgencia && (
            <div className="space-y-1.5">
              <Label className="label-micro flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-ink-muted" />
                Prazo de resolução
              </Label>
              <Input
                type="date"
                value={prazo}
                onChange={e => { setPrazo(e.target.value); setPrazoManual(true) }}
                className="h-9 bg-surface-canvas border-line w-full"
              />
              <p className="text-[11px] text-ink-subtle">Sugerido pela urgência ({urgencia}). Ajuste se precisar.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="label-micro flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-ink-muted" />
              Quando aconteceu{relatoObrigatorio && <Obrigatorio />}
            </Label>
            <Input
              type="datetime-local"
              value={ocorridoEm}
              max={agoraDatetimeLocal()}
              onChange={e => setOcorridoEm(e.target.value)}
              className="h-9 bg-surface-canvas border-line w-full"
            />
            <p className="text-[11px] text-ink-subtle">Data e hora do fato — não é a data em que você está registrando.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="label-micro">Qual exatamente é o problema{relatoObrigatorio && <Obrigatorio />}</Label>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              rows={4}
              className={cn(
                'w-full resize-none rounded-lg border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink',
                'placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue transition-colors',
              )}
              placeholder={aba === 'plataforma'
                ? 'Ex: ao salvar a aula do dia 02/09 a tela mostra "erro ao processar" e a aula não fica lançada.'
                : 'O que aconteceu…'}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="label-micro">Como aconteceu — passo a passo{relatoObrigatorio && <Obrigatorio />}</Label>
            <textarea
              value={passos}
              onChange={e => setPassos(e.target.value)}
              rows={3}
              className={cn(
                'w-full resize-none rounded-lg border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink',
                'placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue transition-colors',
              )}
              placeholder={'1. Entrei em…\n2. Cliquei em…\n3. Aí apareceu…'}
            />
            <p className="text-[11px] text-ink-subtle">
              {aba === 'plataforma'
                ? 'Quem for resolver precisa repetir o caminho pra ver o erro acontecer.'
                : 'Opcional — o caminho até o problema, se ajudar a entender.'}
            </p>
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

          {faltas.length > 0 && (
            <p className="text-[11.5px] text-ink-muted">
              Falta preencher: <span className="text-ink-secondary">{faltas.join(', ')}</span>.
            </p>
          )}

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
