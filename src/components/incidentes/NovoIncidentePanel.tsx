import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  // Suporte icons
  LifeBuoy, BookOpen, LayoutGrid, UserRound, Building2, CircleDollarSign, HelpCircle, AlertOctagon,
  // Controle Interno icons
  CalendarDays, UserX, ListTodo, UserMinus, Flag, Briefcase, FolderOpen, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCriarIncidente } from '@/hooks/useIncidentes'
import { useProfessoresAtivos } from '@/hooks/useProfessores'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import type { UrgenciaNivel } from '@/types'

export type Categoria = 'Suporte' | 'Controle Interno'
type Urgencia = 'Baixa' | 'Média' | 'Alta'

interface TipoItem { key: string; icon: React.ElementType }

const TIPOS_SUPORTE: TipoItem[] = [
  { key: 'Suporte',        icon: LifeBuoy },
  { key: 'Didático',       icon: BookOpen },
  { key: 'Plataforma',     icon: LayoutGrid },
  { key: 'Aluno',          icon: UserRound },
  { key: 'Administrativo', icon: Building2 },
  { key: 'Financeiro',     icon: CircleDollarSign },
  { key: 'Dúvida',         icon: HelpCircle },
  { key: 'Ocorrência',     icon: AlertOctagon },
]

const TIPOS_CI: TipoItem[] = [
  { key: 'Mês de análise',     icon: CalendarDays },
  { key: 'No-Show',            icon: UserX },
  { key: 'Muitas pendências',  icon: ListTodo },
  { key: 'Muitas faltas',      icon: UserMinus },
  { key: 'Reclamação',         icon: Flag },
  { key: 'Profissionalismo',   icon: Briefcase },
  { key: 'Organização',        icon: FolderOpen },
  { key: 'Erros de lançamento',icon: AlertTriangle },
]

const URG_MAP: Record<Urgencia, UrgenciaNivel> = { Baixa: 'baixa', Média: 'media', Alta: 'alta' }

interface Props {
  categoria: Categoria
  onCategoriaChange: (c: Categoria) => void
}

export function NovoIncidentePanel({ categoria, onCategoriaChange }: Props) {
  const criar = useCriarIncidente()
  const { profile } = useAuth()
  const { data: professoresData } = useProfessoresAtivos()
  const professores = professoresData ?? []

  const tipos = categoria === 'Controle Interno' ? TIPOS_CI : TIPOS_SUPORTE

  const [professor, setProfessor]             = useState('')
  const [responsavel, setResponsavel]         = useState(profile?.nome ?? '')
  const [tipo, setTipo]                       = useState(tipos[0].key)
  const [urgencia, setUrgencia]               = useState<Urgencia>('Baixa')
  const [descricao, setDescricao]             = useState('')
  const [solucao, setSolucao]                 = useState('')
  const [precisaAcompanhamento, setPrecisa]   = useState(false)
  const [professorFocus, setProfessorFocus]   = useState(false)

  // Reset tipo when category switches
  useEffect(() => {
    const list = categoria === 'Controle Interno' ? TIPOS_CI : TIPOS_SUPORTE
    setTipo(list[0].key)
  }, [categoria])

  const sugestoes = professor
    ? professores.filter(p => p.nome.toLowerCase().includes(professor.toLowerCase())).slice(0, 6)
    : professores.slice(0, 6)

  async function handleRegistrar() {
    if (!professor.trim() || !descricao.trim()) {
      toast.error('Preencha professor e descrição.')
      return
    }
    const match = professores.find(p => p.nome.toLowerCase() === professor.trim().toLowerCase())

    try {
      await criar.mutateAsync({
        tipo,
        descricao,
        urgencia: URG_MAP[urgencia],
        solucao:  solucao.trim() || undefined,
        responsavel: responsavel.trim() || undefined,
        precisa_acompanhamento: precisaAcompanhamento,
        professor_id: match?.id,
      })
      toast.success('Incidente registrado.')
      setProfessor(''); setDescricao(''); setSolucao(''); setPrecisa(false)
      setUrgencia('Baixa'); setTipo(tipos[0].key)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar.')
    }
  }

  return (
    <aside className="w-full card-surface p-5 space-y-5 sticky top-[72px] animate-fade-up">
      <header className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">Novo Incidente</h2>
        <kbd className="hidden sm:inline-flex items-center rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-muted font-mono">⌘N</kbd>
      </header>

      {/* Category toggle */}
      <div className="grid grid-cols-2 rounded-lg bg-surface-subtle p-1 text-[12px] font-medium">
        {(['Suporte', 'Controle Interno'] as Categoria[]).map(c => (
          <button
            key={c}
            onClick={() => onCategoriaChange(c)}
            className={cn(
              'btn-press rounded-md px-3 py-1.5',
              categoria === c ? 'bg-surface-canvas text-ink shadow-card' : 'text-ink-muted hover:text-ink',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Professor — autocomplete */}
      <div className="space-y-1.5 relative">
        <Label className="label-micro">Professor <span className="text-brand">*</span></Label>
        <Input
          placeholder="Ex: Ana Clara Barbosa"
          value={professor}
          onChange={e => setProfessor(e.target.value)}
          onFocus={() => setProfessorFocus(true)}
          onBlur={() => setTimeout(() => setProfessorFocus(false), 120)}
          className="h-9 bg-surface-canvas border-line"
        />
        {professorFocus && sugestoes.length > 0 && (
          <ul className="absolute z-20 top-full left-0 right-0 mt-1 max-h-48 overflow-auto rounded-md border border-line bg-surface-canvas shadow-popover text-[13px]">
            {sugestoes.map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={() => setProfessor(p.nome)}
                  className="w-full text-left px-3 py-1.5 hover:bg-surface-subtle text-ink"
                >
                  {p.nome}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Responsável */}
      <div className="space-y-1.5">
        <Label className="label-micro">Responsável <span className="text-brand">*</span></Label>
        <Input
          placeholder="Nome do responsável"
          value={responsavel}
          onChange={e => setResponsavel(e.target.value)}
          className="h-9 bg-surface-canvas border-line"
        />
      </div>

      {/* Tipo — adapts per category */}
      <div className="space-y-2">
        <Label className="label-micro">Tipo de problema</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {tipos.map(({ key, icon: Icon }) => {
            const active = tipo === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTipo(key)}
                className={cn(
                  'btn-press flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium text-left',
                  active
                    ? 'border-accentBlue bg-accentBlue text-white shadow-[0_1px_2px_rgba(42,92,255,0.25)]'
                    : 'border-line bg-surface-canvas text-ink-secondary hover:border-line-strong hover:text-ink',
                )}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{key}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Urgência */}
      <div className="space-y-2">
        <Label className="label-micro">Urgência</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {(['Baixa', 'Média', 'Alta'] as Urgencia[]).map(u => {
            const active = urgencia === u
            const pal: Record<Urgencia, string> = {
              Baixa: active ? 'border-urg-lowFg/40 bg-urg-lowBg text-urg-lowFg' : 'border-line text-ink-secondary',
              Média: active ? 'border-urg-medFg/40 bg-urg-medBg text-urg-medFg' : 'border-line text-ink-secondary',
              Alta:  active ? 'border-urg-highFg/40 bg-urg-highBg text-urg-highFg' : 'border-line text-ink-secondary',
            }
            return (
              <button
                key={u}
                type="button"
                onClick={() => setUrgencia(u)}
                className={cn(
                  'btn-press rounded-md border px-2.5 py-1.5 text-[12px] font-medium bg-surface-canvas',
                  pal[u],
                )}
              >
                {u}
              </button>
            )
          })}
        </div>
      </div>

      {/* Descrição */}
      <div className="space-y-1.5">
        <Label className="label-micro">Descrição <span className="text-brand">*</span></Label>
        <textarea
          rows={3}
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          placeholder="O que aconteceu?"
          className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue transition-colors"
        />
      </div>

      {/* Solução */}
      <div className="space-y-1.5">
        <Label className="label-micro">Solução aplicada</Label>
        <textarea
          rows={2}
          value={solucao}
          onChange={e => setSolucao(e.target.value)}
          placeholder="O que foi feito?"
          className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue transition-colors"
        />
      </div>

      {/* Follow-up toggle */}
      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-[13px] text-ink">Precisa de acompanhamento?</span>
        <button
          type="button"
          role="switch"
          aria-checked={precisaAcompanhamento}
          onClick={() => setPrecisa(v => !v)}
          className={cn(
            'relative h-5 w-9 rounded-full transition-colors flex-shrink-0',
            precisaAcompanhamento ? 'bg-accentBlue' : 'bg-surface-muted',
          )}
        >
          <span className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
            precisaAcompanhamento ? 'left-[18px]' : 'left-0.5',
          )} />
        </button>
      </label>

      <Button
        onClick={handleRegistrar}
        disabled={criar.isPending}
        className="btn-press w-full h-10 bg-accentBlue hover:bg-accentBlue-hov text-white font-medium"
      >
        {criar.isPending ? 'Registrando…' : 'Registrar Incidente'}
      </Button>
    </aside>
  )
}
