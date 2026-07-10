import { useEffect, useMemo, useState } from 'react'
import {
  ShieldCheck, Users, Save, Shuffle, AlertTriangle, Info, Check,
  Zap, ZapOff, Loader2, CalendarClock,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useGrupos, useAtualizarGrupo, useDistribuirInicial } from '@/hooks/useGrupos'
import type { ResultadoDistribuicao } from '@/hooks/useGrupos'
import { useCoordenadores } from '@/hooks/useAcompanhamento'
import type { CoordenadorPerfil } from '@/hooks/useAcompanhamento'
import { useProfessoresAtivos } from '@/hooks/useProfessores'
import { useGoogleAutomation, useDesativarAutomacao } from '@/hooks/useGoogleAutomation'
import { solicitarCodigoGoogle, loadGIS } from '@/lib/googleCalendar'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import type { GrupoComCoordenador } from '@/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const NONE = 'none'

export function ConfiguracoesPage() {
  const { data: grupos, isLoading }   = useGrupos()
  const { data: coordenadores = [] }  = useCoordenadores()
  const { data: professores = [] }    = useProfessoresAtivos()

  const totalPorGrupo = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of professores) {
      if (p.grupo_id) m[p.grupo_id] = (m[p.grupo_id] ?? 0) + 1
    }
    return m
  }, [professores])

  return (
    <div className="px-6 py-6 max-w-[1100px] mx-auto space-y-6">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Configurações</h1>
          <p className="text-[13px] text-ink-muted">Grupos de coordenação e distribuição de professores.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-urg-medBg px-3 py-1 text-[11px] font-medium text-urg-medFg">
          <ShieldCheck className="h-3.5 w-3.5" />
          Admin
        </span>
      </header>

      {/* ── Importação automática do Google Calendar ──────────────────────── */}
      <GoogleAutomationCard />

      {/* ── Grupos de coordenação ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-ink-secondary" />
          <h2 className="text-[15px] font-semibold text-ink">Grupos de coordenação</h2>
        </div>

        {isLoading ? (
          <div className="card-surface p-10 text-center text-[13px] text-ink-muted">Carregando…</div>
        ) : (
          <div className="card-surface overflow-hidden">
            {/* Cabeçalho */}
            <div className="hidden sm:grid grid-cols-[1fr_220px_90px_96px] gap-4 px-5 py-2.5 border-b border-line-soft bg-surface-subtle/60">
              <span className="label-micro">Nome do grupo</span>
              <span className="label-micro">Coordenador responsável</span>
              <span className="label-micro text-center">Profs.</span>
              <span className="label-micro text-right">Ação</span>
            </div>

            <ul className="divide-y divide-line-soft">
              {(grupos ?? []).map(g => (
                <GrupoRow
                  key={g.id}
                  grupo={g}
                  coordenadores={coordenadores}
                  total={totalPorGrupo[g.id] ?? 0}
                />
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Distribuição inicial ──────────────────────────────────────────── */}
      <DistribuicaoCard />
    </div>
  )
}

// ─── Importação automática do Google Calendar ──────────────────────────────

function GoogleAutomationCard() {
  const automation  = useGoogleAutomation()
  const desativar   = useDesativarAutomacao()
  const queryClient = useQueryClient()
  const [ativando, setAtivando] = useState(false)
  const ativa = automation.data?.ativo ?? false

  // Pré-carrega o script do Google Identity Services assim que a tela abre —
  // se ele só carrega dentro de handleAtivar, o `await loadGIS()` antes do
  // requestCode() quebra a cadeia de gesto do usuário (o clique) e o Chrome
  // bloqueia o popup ("Failed to open popup window"). Carregando cedo, o
  // clique já encontra window.google.accounts.oauth2 pronto.
  useEffect(() => {
    loadGIS().catch(() => { /* tenta de novo no clique, com o toast de erro normal */ })
  }, [])

  async function handleAtivar() {
    try {
      setAtivando(true)
      const code = await solicitarCodigoGoogle()
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('exchange-google-token', {
        body:    { code },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Erro desconhecido.')
      toast.success('Importação automática ativada. Reuniões novas aparecem em até 10 minutos.')
      queryClient.invalidateQueries({ queryKey: ['google', 'automation'] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.toLowerCase().includes('popup_closed') && !msg.toLowerCase().includes('access_denied')) {
        toast.error(`Erro ao ativar: ${msg}`)
      }
    } finally {
      setAtivando(false)
    }
  }

  async function handleDesativar() {
    try {
      await desativar.mutateAsync()
      toast.success('Importação automática desativada.')
    } catch {
      toast.error('Erro ao desativar.')
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-ink-secondary" />
        <h2 className="text-[15px] font-semibold text-ink">Importação automática do Google Calendar</h2>
      </div>

      {automation.isLoading ? (
        <div className="card-surface p-6 text-center text-[13px] text-ink-muted">Carregando…</div>
      ) : (
        <div className={cn(
          'card-surface flex items-center justify-between gap-4 p-5',
          ativa && 'border-urg-lowFg/25 bg-urg-lowBg',
        )}>
          <div className="flex items-center gap-3 min-w-0">
            {ativa
              ? <Zap className="h-4 w-4 text-urg-lowFg flex-shrink-0" />
              : <ZapOff className="h-4 w-4 text-ink-muted flex-shrink-0" />}
            <div className="min-w-0">
              <p className={cn('text-[13px] font-medium', ativa ? 'text-urg-lowFg' : 'text-ink')}>
                Importação {ativa
                  ? <span className="font-semibold">ativa</span>
                  : <span className="text-ink-muted font-normal">inativa</span>}
              </p>
              <p className="text-[12px] text-ink-muted mt-0.5">
                {ativa
                  ? 'Conta Google conectada — reuniões novas do Calendar aparecem em Reuniões do Dia em até 10 minutos.'
                  : 'Conecte a conta Google compartilhada da coordenação para importar reuniões automaticamente.'}
              </p>
            </div>
          </div>

          {ativa ? (
            <Button
              size="sm"
              variant="outline"
              disabled={desativar.isPending}
              onClick={handleDesativar}
              className="btn-press h-8 text-[12px] border-urg-highFg/25 text-urg-highFg hover:bg-urg-highBg flex-shrink-0"
            >
              {desativar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Desativar'}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={ativando}
              onClick={handleAtivar}
              className="btn-press h-8 text-[12px] gap-1.5 bg-accentBlue hover:bg-accentBlue-hov text-white flex-shrink-0"
            >
              {ativando ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Aguardando…</> : <><Zap className="h-3.5 w-3.5" />Ativar</>}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

// ─── Linha de grupo ─────────────────────────────────────────────────────────

function GrupoRow({ grupo, coordenadores, total }: {
  grupo: GrupoComCoordenador
  coordenadores: CoordenadorPerfil[]
  total: number
}) {
  const atualizar = useAtualizarGrupo()
  const [nome, setNome]       = useState(grupo.nome)
  const [coordId, setCoordId] = useState<string>(grupo.coordenador_id ?? NONE)

  const dirty =
    nome.trim() !== grupo.nome ||
    (coordId === NONE ? null : coordId) !== (grupo.coordenador_id ?? null)

  async function salvar() {
    if (!nome.trim()) {
      toast.error('O nome do grupo não pode ficar vazio.')
      return
    }
    try {
      await atualizar.mutateAsync({
        id: grupo.id,
        nome: nome.trim(),
        coordenador_id: coordId === NONE ? null : coordId,
      })
      toast.success('Grupo atualizado.')
    } catch {
      toast.error('Erro ao salvar o grupo.')
    }
  }

  return (
    <li className="grid sm:grid-cols-[1fr_220px_90px_96px] gap-4 px-5 py-3.5 items-center">
      {/* Nome */}
      <Input
        value={nome}
        onChange={e => setNome(e.target.value)}
        className="h-8 text-[13px] bg-surface-canvas border-line"
      />

      {/* Coordenador */}
      <Select value={coordId} onValueChange={setCoordId} disabled={atualizar.isPending}>
        <SelectTrigger size="sm" className="bg-surface-canvas border-line text-ink w-full">
          <SelectValue placeholder="Sem coordenador" />
        </SelectTrigger>
        <SelectContent className="bg-surface-canvas border-line text-ink">
          <SelectItem value={NONE} className="text-[12px] text-ink-muted">Sem coordenador</SelectItem>
          {coordenadores.map(c => (
            <SelectItem key={c.id} value={c.id} className="text-[12px]">{c.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Total */}
      <span className="hidden sm:block text-center text-[13px] tabular-nums text-ink-secondary font-medium">
        {total}
      </span>

      {/* Salvar */}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || atualizar.isPending}
          onClick={salvar}
          className="btn-press h-7 text-[11px] gap-1.5 border-line"
        >
          <Save className="h-3 w-3" />
          Salvar
        </Button>
      </div>
    </li>
  )
}

// ─── Distribuição inicial ───────────────────────────────────────────────────

type Mode = 'idle' | 'confirm' | 'force'

function DistribuicaoCard() {
  const distribuir = useDistribuirInicial()
  const [mode, setMode]           = useState<Mode>('idle')
  const [resultado, setResultado] = useState<ResultadoDistribuicao[] | null>(null)

  async function run(force: boolean) {
    try {
      const res = await distribuir.mutateAsync(force)
      setResultado(res)
      setMode('idle')
      toast.success('Distribuição concluída.')
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e
        ? String((e as { message: unknown }).message)
        : 'Erro desconhecido'
      if (msg.includes('Já existem')) {
        setMode('force')          // já distribuído → oferece redistribuir
      } else {
        setMode('idle')
        toast.error(`Erro na distribuição: ${msg}`)
      }
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Shuffle className="h-4 w-4 text-ink-secondary" />
        <h2 className="text-[15px] font-semibold text-ink">Distribuição inicial</h2>
      </div>

      <div className="card-surface p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-accentBlue flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-ink-secondary leading-relaxed">
            Divide os professores ativos entre os 3 grupos de forma equilibrada, mantendo
            aproximadamente <span className="font-medium text-ink">⅓ de cada faixa de tempo de casa</span> em
            cada grupo (até 3 meses · 3 a 8 meses · mais de 8 meses). Rode uma única vez, após
            definir o coordenador de cada grupo.
          </p>
        </div>

        {/* Resultado */}
        {resultado && (
          <div className="rounded-lg border border-urg-lowFg/25 bg-urg-lowBg/40 px-4 py-3">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-urg-lowFg mb-1.5">
              <Check className="h-3.5 w-3.5" />
              Professores distribuídos
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-secondary">
              {resultado.map(r => (
                <span key={r.grupo_id}>
                  {r.nome}: <span className="font-semibold text-ink tabular-nums">{r.total}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Ações */}
        {mode === 'idle' && (
          <Button
            onClick={() => setMode('confirm')}
            disabled={distribuir.isPending}
            className="btn-press h-9 text-[13px] gap-2 bg-brand text-white hover:bg-brand-strong"
          >
            <Shuffle className="h-4 w-4" />
            Executar distribuição inicial
          </Button>
        )}

        {mode === 'confirm' && (
          <ConfirmBox
            title="Reorganizar todos os professores nos 3 grupos?"
            description="Os professores ativos serão redistribuídos conforme a regra acima."
            confirmLabel="Sim, distribuir"
            pending={distribuir.isPending}
            onConfirm={() => run(false)}
            onCancel={() => setMode('idle')}
          />
        )}

        {mode === 'force' && (
          <ConfirmBox
            title="Os professores já foram distribuídos antes."
            description="Deseja redistribuir do zero? Isso recalcula o grupo de todos os professores ativos."
            confirmLabel="Sim, redistribuir"
            pending={distribuir.isPending}
            onConfirm={() => run(true)}
            onCancel={() => setMode('idle')}
          />
        )}
      </div>
    </section>
  )
}

function ConfirmBox({ title, description, confirmLabel, pending, onConfirm, onCancel }: {
  title: string
  description: string
  confirmLabel: string
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="rounded-lg border border-urg-highFg/25 bg-urg-highBg/40 px-4 py-3.5 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 text-urg-highFg flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-[13px] font-medium text-ink">{title}</p>
          <p className="text-[12px] text-ink-muted">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-[26px]">
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={pending}
          className={cn('btn-press h-7 text-[11px] bg-brand text-white hover:bg-brand-strong')}
        >
          {confirmLabel}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
          className="btn-press h-7 text-[11px] border-line"
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
