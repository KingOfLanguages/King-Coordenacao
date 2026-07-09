import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayCircle, User, Users, CalendarClock, CheckCircle2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useProfessoresDespausados, useConcluirAcompanhamentoPausa, type ProfessorDespausado } from '@/hooks/useProfessores'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { StatusProfessor } from '@/types'

const STATUS_CHIP: Record<StatusProfessor, { label: string; cls: string }> = {
  ativo:     { label: 'Ativo',     cls: 'bg-urg-lowBg text-urg-lowFg' },
  pausa:     { label: 'Em pausa',  cls: 'bg-surface-subtle text-ink-secondary' },
  desligado: { label: 'Desligado', cls: 'bg-urg-highBg text-urg-highFg' },
}

function StatusProfessorChip({ status }: { status: StatusProfessor }) {
  const s = STATUS_CHIP[status] ?? STATUS_CHIP.ativo
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', s.cls)}>
      {s.label}
    </span>
  )
}

function resolverPerfil(ref: { nome: string } | { nome: string }[] | null | undefined): string | null {
  const r = Array.isArray(ref) ? ref[0] : ref
  return r?.nome ?? null
}

function diasDesde(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'há 1 dia'
  return `há ${dias} dias`
}

export function RetornoPausaPage() {
  const { profile } = useAuth()
  const podeEditar = canEdit(profile)
  const navigate = useNavigate()
  const { data: professores = [], isLoading } = useProfessoresDespausados()
  const concluir = useConcluirAcompanhamentoPausa()
  const [busca, setBusca] = useState('')

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return professores
    return professores.filter(p =>
      p.nome.toLowerCase().includes(termo) ||
      (p.grupo?.nome ?? '').toLowerCase().includes(termo) ||
      (p.coordenador?.nome ?? '').toLowerCase().includes(termo))
  }, [professores, busca])

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Retorno de Pausa</h1>
          <p className="text-[13px] text-ink-muted">
            Professores tirados da pausa manualmente, em acompanhamento.
            {' '}<span className="tabular-nums text-ink-secondary font-medium">{professores.length}</span> no total.
          </p>
        </div>
        <div className="relative w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
          <Input
            placeholder="Buscar professor, grupo ou coordenador…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 h-9 bg-surface-canvas border-line"
          />
        </div>
      </header>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
      ) : filtrados.length === 0 ? (
        <div className="card-surface p-12 text-center space-y-3">
          <div className="mx-auto h-10 w-10 rounded-full bg-surface-subtle text-ink-muted flex items-center justify-center">
            <PlayCircle className="h-4 w-4" />
          </div>
          <p className="text-[14px] font-medium text-ink">Nenhum professor em retorno de pausa</p>
          <p className="text-[13px] text-ink-muted">
            Quando você tirar um professor da pausa (no perfil dele), ele aparece aqui pra acompanhamento.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map(p => (
            <CardDespausado
              key={p.id}
              professor={p}
              podeEditar={podeEditar}
              concluindo={concluir.isPending}
              onVer={() => navigate(`/professores/${p.id}`)}
              onConcluir={() => concluir.mutate(p.id, {
                onSuccess: () => toast.success(`Acompanhamento de ${p.nome} encerrado.`),
                onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao encerrar acompanhamento.'),
              })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CardDespausado({
  professor, podeEditar, concluindo, onVer, onConcluir,
}: {
  professor: ProfessorDespausado
  podeEditar: boolean
  concluindo: boolean
  onVer: () => void
  onConcluir: () => void
}) {
  const porNome = resolverPerfil(professor.despausado_por_perfil)
  // O sync do KMS re-pausou apesar da trava? Só aconteceria com 'desligado' (que libera a trava);
  // ainda assim sinalizamos se o status atual não for "ativo".
  const statusInesperado = professor.status !== 'ativo'

  return (
    <div className="card-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onVer}
          className="btn-press text-left font-medium text-[14px] text-ink leading-tight hover:text-accentBlue hover:underline truncate flex-1"
        >
          {professor.nome}
        </button>
        <StatusProfessorChip status={professor.status} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {professor.grupo?.nome && (
          <span className="inline-flex items-center rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
            {professor.grupo.nome}
          </span>
        )}
        {professor.coordenador?.nome && (
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
            <User className="h-3 w-3" />{professor.coordenador.nome}
          </span>
        )}
      </div>

      <div className="space-y-1 text-[11.5px] text-ink-muted">
        {professor.despausado_em && (
          <p className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3 w-3" />
            Tirado da pausa {diasDesde(professor.despausado_em)}
            <span className="text-ink-subtle tabular-nums">
              ({new Date(professor.despausado_em).toLocaleDateString('pt-BR')})
            </span>
          </p>
        )}
        {porNome && (
          <p className="inline-flex items-center gap-1.5">
            <Users className="h-3 w-3" />por {porNome}
          </p>
        )}
        {statusInesperado && (
          <p className="text-urg-highFg font-medium">
            Atenção: status atual é "{professor.status}" — verifique no KMS.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline" size="sm"
          onClick={onVer}
          className="btn-press h-8 flex-1 border-line text-ink-secondary hover:text-ink text-[12px]"
        >
          Ver perfil
        </Button>
        {podeEditar && (
          <Button
            size="sm"
            disabled={concluindo}
            onClick={onConcluir}
            className={cn('btn-press h-8 flex-1 gap-1.5 text-[12px]', 'bg-urg-lowFg text-white hover:opacity-90')}
            title="Encerra o acompanhamento — o status volta a ser governado pelo KMS."
          >
            <CheckCircle2 className="h-3.5 w-3.5" />Concluir
          </Button>
        )}
      </div>
    </div>
  )
}
