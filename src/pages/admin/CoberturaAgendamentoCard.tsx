import { useMemo, useState } from 'react'
import {
  UserRoundCheck, Info, Loader2, Plane, AlertTriangle, Check, X, ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import {
  useCoberturas, useCoordenadoresAgendamento, useCriarCobertura, useEncerrarCobertura,
  type CoberturaAgendamento, type CoordenadorAgendamento,
} from '@/hooks/useCoberturaAgendamento'
import { dataBR } from '@/lib/formato'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// "Vou entrar de férias — quem atende meu grupo é o X."
//
// O /agendar resolve o coordenador do professor e manda ele pros links DESSE
// coordenador. Com o coordenador fora, o grupo dele ficava sem reunião. Aqui
// cada coordenador marca a própria ausência e escolhe quem cobre; no período,
// o portal oferece os links do substituto, dizendo quem vai atender.
//
// Admin e liderança podem lançar em nome de qualquer coordenador (quem viaja
// às vezes só avisa no grupo). A RLS da 20260814 é quem garante isso de fato —
// o seletor aqui é só conveniência.
// ─────────────────────────────────────────────────────────────────────────────

const NONE = 'none'

/** Hoje em São Paulo (YYYY-MM-DD) — mesmo recorte de dia que a function usa. */
function hojeISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function CoberturaAgendamentoCard() {
  const { profile } = useAuth()
  const { data: coordenadores = [] } = useCoordenadoresAgendamento()
  const { data: coberturas = [], isLoading } = useCoberturas()

  if (!profile || (profile.role !== 'coordenacao' && profile.role !== 'admin' && !profile.is_admin)) return null

  const podeLancarPorOutro = profile.is_admin || profile.is_lider || profile.role === 'admin'

  const ativas = coberturas.filter(c => c.vigente || c.agendada)
  const passadas = coberturas.filter(c => !c.vigente && !c.agendada)

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accentBlue-soft text-accentBlue">
          <Plane className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-[15px] font-semibold text-ink">Cobertura de agendamento</h2>
      </div>

      <div className="card-surface p-5 space-y-5">
        <div className="flex items-start gap-2.5 rounded-lg border border-line-soft bg-surface-subtle/60 px-3.5 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accentBlue" />
          <p className="text-[12px] leading-relaxed text-ink-secondary">
            Quando um coordenador se ausenta (férias, licença, viagem), os professores do grupo dele
            passam a agendar na agenda de quem está cobrindo — no Portal de Agendamento e na tela de
            conclusão do Welcome Path, com aviso de quem vai atender. Grupo, KPIs, Índice de atenção e
            pendências não mudam de lugar: continuam com a coordenação titular. Reunião em grupo não
            precisa de desvio, porque o portal já mostra as agendas de todos os coordenadores juntas.
          </p>
        </div>

        <FormCobertura
          coordenadores={coordenadores}
          meuId={profile.id}
          podeLancarPorOutro={podeLancarPorOutro}
        />

        <div className="space-y-3 border-t border-line-soft pt-4">
          <span className="label-micro">No ar e agendadas</span>
          {isLoading ? (
            <div className="h-14 rounded-lg bg-surface-subtle animate-pulse" />
          ) : ativas.length === 0 ? (
            <p className="text-[12.5px] text-ink-muted">
              Nenhuma cobertura ativa — cada grupo está sendo atendido pelo próprio coordenador.
            </p>
          ) : (
            <ul className="space-y-2">
              {ativas.map(c => <LinhaCobertura key={c.id} cobertura={c} />)}
            </ul>
          )}
        </div>

        {passadas.length > 0 && (
          <details className="group border-t border-line-soft pt-4">
            <summary className="label-micro cursor-pointer list-none select-none hover:text-ink-secondary">
              Histórico ({passadas.length})
            </summary>
            <ul className="mt-3 space-y-2">
              {passadas.map(c => <LinhaCobertura key={c.id} cobertura={c} />)}
            </ul>
          </details>
        )}
      </div>
    </section>
  )
}

// ─── Formulário ─────────────────────────────────────────────────────────────

function FormCobertura({ coordenadores, meuId, podeLancarPorOutro }: {
  coordenadores: CoordenadorAgendamento[]
  meuId: string
  podeLancarPorOutro: boolean
}) {
  const criar = useCriarCobertura()
  const [ausenteId, setAusenteId]   = useState(meuId)
  const [substitutoId, setSubstituto] = useState<string>(NONE)
  const [inicio, setInicio] = useState(hojeISO())
  const [fim, setFim]       = useState('')
  const [motivo, setMotivo] = useState('')

  const substitutos = useMemo(
    () => coordenadores.filter(c => c.id !== ausenteId),
    [coordenadores, ausenteId],
  )
  const substituto = coordenadores.find(c => c.id === substitutoId) ?? null

  // Sem link cadastrado, o portal cai de volta no link do titular — que está de
  // férias. Avisa antes de viajar, enquanto ainda dá tempo de resolver.
  const faltamLinks = substituto
    ? [
        !substituto.tem_link_primeira ? '1ª reunião (Koalendar)' : null,
        !substituto.tem_link_acompanhamento ? 'acompanhamento (Google Appointment)' : null,
      ].filter(Boolean) as string[]
    : []

  const periodoInvalido = !!inicio && !!fim && fim < inicio
  const valido = !!ausenteId && substitutoId !== NONE && !!inicio && !!fim && !periodoInvalido

  async function salvar() {
    try {
      await criar.mutateAsync({
        coordenadorAusenteId: ausenteId,
        substitutoId,
        inicio,
        fim,
        motivo,
      })
      toast.success('Cobertura ativada.')
      setSubstituto(NONE)
      setFim('')
      setMotivo('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao ativar a cobertura.')
    }
  }

  return (
    <div className="space-y-4">
      <div className={cn('grid gap-4', podeLancarPorOutro ? 'sm:grid-cols-2' : 'sm:grid-cols-1')}>
        {podeLancarPorOutro && (
          <div className="space-y-1.5">
            <Label className="text-[12px] font-medium text-ink-secondary">Coordenador ausente</Label>
            <Select value={ausenteId} onValueChange={v => { setAusenteId(v); setSubstituto(NONE) }}>
              <SelectTrigger className="h-9 border-line bg-surface-canvas text-[13px]">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {coordenadores.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-[12px] font-medium text-ink-secondary">Quem atende no período</Label>
          <Select value={substitutoId} onValueChange={setSubstituto}>
            <SelectTrigger className="h-9 border-line bg-surface-canvas text-[13px]">
              <SelectValue placeholder="Selecione um coordenador" />
            </SelectTrigger>
            <SelectContent>
              {substitutos.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[150px_150px_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="cobertura-inicio" className="text-[12px] font-medium text-ink-secondary">Primeiro dia</Label>
          <Input
            id="cobertura-inicio"
            type="date"
            value={inicio}
            onChange={e => setInicio(e.target.value)}
            className="h-9 border-line bg-surface-canvas text-[13px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cobertura-fim" className="text-[12px] font-medium text-ink-secondary">Último dia</Label>
          <Input
            id="cobertura-fim"
            type="date"
            value={fim}
            min={inicio || undefined}
            onChange={e => setFim(e.target.value)}
            className="h-9 border-line bg-surface-canvas text-[13px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cobertura-motivo" className="text-[12px] font-medium text-ink-secondary">
            Motivo <span className="text-ink-subtle">(opcional)</span>
          </Label>
          <Input
            id="cobertura-motivo"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Férias, licença…"
            className="h-9 border-line bg-surface-canvas text-[13px]"
          />
        </div>
      </div>

      {periodoInvalido && (
        <p className="text-[12px] text-urg-highFg">O último dia não pode ser antes do primeiro.</p>
      )}

      {faltamLinks.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-aviso-warnBd bg-aviso-warnBg px-3.5 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-aviso-warnFg" />
          <p className="text-[12px] leading-relaxed text-ink-secondary">
            {substituto?.nome} ainda não cadastrou o link de {faltamLinks.join(' nem de ')}.
            Sem ele, esse tipo de reunião continua caindo na agenda de quem está ausente — peça
            pra ele preencher em <strong>Meus links de agendamento individual</strong>, logo acima.
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!valido || criar.isPending}
          onClick={salvar}
          className="btn-press h-8 gap-1.5 bg-brand text-[12px] text-white hover:bg-brand-strong"
        >
          {criar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserRoundCheck className="h-3.5 w-3.5" />}
          Ativar cobertura
        </Button>
      </div>
    </div>
  )
}

// ─── Linha da lista ─────────────────────────────────────────────────────────

function LinhaCobertura({ cobertura: c }: { cobertura: CoberturaAgendamento }) {
  const encerrar = useEncerrarCobertura()
  const ativa = c.vigente || c.agendada

  async function confirmar() {
    try {
      await encerrar.mutateAsync(c.id)
      toast.success(c.vigente ? 'Cobertura encerrada.' : 'Cobertura cancelada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao encerrar a cobertura.')
    }
  }

  return (
    <li className={cn(
      'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3.5 py-2.5',
      // Tokens aviso-*: sempre sólidos — modificador de opacidade não funciona neles.
      c.vigente ? 'border-aviso-okBd bg-aviso-okBg' : 'border-line-soft bg-surface-canvas',
    )}>
      <EstadoChip cobertura={c} />

      <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] text-ink">
        <span className="font-medium">{c.coordenador_ausente_nome ?? '—'}</span>
        {c.grupos_cobertos && <span className="text-[11.5px] text-ink-muted">({c.grupos_cobertos})</span>}
        <ArrowRight className="h-3.5 w-3.5 text-ink-subtle" />
        <span className="font-medium">{c.substituto_nome ?? '—'}</span>
      </span>

      <span className="text-[12px] tabular-nums text-ink-muted">
        {dataBR(c.inicio)} – {dataBR(c.fim)}
      </span>

      {c.motivo && <span className="text-[12px] text-ink-muted">· {c.motivo}</span>}

      {ativa && (
        <Button
          size="sm"
          variant="ghost"
          disabled={encerrar.isPending}
          onClick={confirmar}
          className="btn-press ml-auto h-7 gap-1.5 px-2.5 text-[12px] text-ink-muted hover:text-ink"
        >
          {encerrar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
          {c.vigente ? 'Encerrar agora' : 'Cancelar'}
        </Button>
      )}
    </li>
  )
}

function EstadoChip({ cobertura: c }: { cobertura: CoberturaAgendamento }) {
  if (c.vigente) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-aviso-okBg px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-aviso-okFg">
        <span className="h-1.5 w-1.5 rounded-full bg-aviso-okFg" />
        No ar
      </span>
    )
  }
  if (c.agendada) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accentBlue-soft px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-accentBlue">
        Agendada
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-muted">
      <Check className="h-2.5 w-2.5" />
      {c.encerrada_em ? 'Encerrada' : 'Concluída'}
    </span>
  )
}
