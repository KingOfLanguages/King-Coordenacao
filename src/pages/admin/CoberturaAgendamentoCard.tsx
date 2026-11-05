import { useMemo, useState } from 'react'
import {
  UserRoundCheck, Info, Loader2, Plane, AlertTriangle, Check, X, ArrowRight, Plus,
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
// "Vou entrar de férias — quem atende meu grupo é o X (e o Y)."
//
// O /agendar resolve o coordenador do professor e manda ele pros links DESSE
// coordenador. Com o coordenador fora, o grupo dele ficava sem reunião. Aqui
// cada coordenador marca a própria ausência e escolhe quem cobre; no período,
// o portal oferece a agenda de quem está atendendo, dizendo quem é.
//
// Dá pra marcar MAIS DE UM (20260816): a coordenação é em três, então quando um
// viaja são os outros dois que absorvem o grupo dele — duas semanas de reuniões
// divididas em duas agendas, e o professor marca com quem tiver horário. No
// banco é uma linha por par (ausente, substituto); aqui elas aparecem juntas
// numa linha só, e cada nome pode sair da cobertura sem mexer no outro.
//
// Admin e liderança podem lançar em nome de qualquer coordenador (quem viaja
// às vezes só avisa no grupo). A RLS da 20260814 é quem garante isso de fato —
// o seletor aqui é só conveniência.
// ─────────────────────────────────────────────────────────────────────────────

/** Hoje em São Paulo (YYYY-MM-DD) — mesmo recorte de dia que a function usa. */
function hojeISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** "Caio", "Caio e Ariel", "Caio, Ariel e João" — pra frase ficar legível. */
function nomes(lista: { nome: string }[]): string {
  const n = lista.map(c => c.nome)
  if (n.length <= 1) return n[0] ?? ''
  return `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`
}

/** Uma cobertura como ela é lida na tela: o mesmo ausente, o mesmo período e o
 *  mesmo motivo, com um ou mais coordenadores atendendo. */
type GrupoCobertura = {
  chave: string
  /** Uma linha do banco por substituto, em ordem de nome. */
  linhas: CoberturaAgendamento[]
  /** Qualquer uma delas serve pra ler ausente, período, motivo e estado. */
  base: CoberturaAgendamento
}

/** Junta as linhas que são a mesma ausência. O estado entra na chave pra uma
 *  linha já encerrada não se misturar com as que seguem no ar. */
function agrupar(coberturas: CoberturaAgendamento[]): GrupoCobertura[] {
  const mapa = new Map<string, CoberturaAgendamento[]>()
  for (const c of coberturas) {
    const chave = [
      c.coordenador_ausente_id, c.inicio, c.fim, c.motivo ?? '', c.vigente, c.agendada,
    ].join('|')
    const lista = mapa.get(chave)
    if (lista) lista.push(c)
    else mapa.set(chave, [c])
  }
  return [...mapa.entries()].map(([chave, linhas]) => ({
    chave,
    linhas: [...linhas].sort(
      (a, b) => (a.substituto_nome ?? '').localeCompare(b.substituto_nome ?? '', 'pt-BR'),
    ),
    base: linhas[0],
  }))
}

export function CoberturaAgendamentoCard() {
  const { profile } = useAuth()
  const { data: coordenadores = [] } = useCoordenadoresAgendamento()
  const { data: coberturas = [], isLoading } = useCoberturas()

  if (!profile || (profile.role !== 'coordenacao' && profile.role !== 'admin' && !profile.is_admin)) return null

  const podeLancarPorOutro = profile.is_admin || profile.is_lider || profile.role === 'admin'

  const grupos = agrupar(coberturas)
  const ativas = grupos.filter(g => g.base.vigente || g.base.agendada)
  const passadas = grupos.filter(g => !g.base.vigente && !g.base.agendada)

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
            conclusão do Welcome Path, com aviso de quem vai atender. Pode marcar mais de um
            coordenador: o professor vê a agenda de cada um e escolhe onde tem horário. Grupo, KPIs,
            Índice de atenção e pendências não mudam de lugar: continuam com a coordenação titular.
            Reunião em grupo não precisa de desvio, porque o portal já mostra as agendas de todos os
            coordenadores juntas.
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
              {ativas.map(g => <LinhaCobertura key={g.chave} grupo={g} />)}
            </ul>
          )}
        </div>

        {passadas.length > 0 && (
          <details className="group border-t border-line-soft pt-4">
            <summary className="label-micro cursor-pointer list-none select-none hover:text-ink-secondary">
              Histórico ({passadas.length})
            </summary>
            <ul className="mt-3 space-y-2">
              {passadas.map(g => <LinhaCobertura key={g.chave} grupo={g} />)}
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
  const [ausenteId, setAusenteId] = useState(meuId)
  const [escolhidosIds, setEscolhidos] = useState<string[]>([])
  const [inicio, setInicio] = useState(hojeISO())
  const [fim, setFim]       = useState('')
  const [motivo, setMotivo] = useState('')

  const substitutos = useMemo(
    () => coordenadores.filter(c => c.id !== ausenteId),
    [coordenadores, ausenteId],
  )
  const escolhidos = useMemo(
    () => substitutos.filter(c => escolhidosIds.includes(c.id)),
    [substitutos, escolhidosIds],
  )

  function alternar(id: string) {
    setEscolhidos(atual => atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id])
  }

  // Link que ninguém cadastrou é o caso ruim: esse tipo de reunião continua
  // caindo na agenda de quem viajou. Se pelo menos um tem, o portal oferece só
  // a agenda de quem tem — vale dizer qual, porque o outro nome não vai
  // aparecer pro professor e isso costuma soar como bug.
  const recados = useMemo(() => {
    if (escolhidos.length === 0) return []
    const tipos = [
      { rotulo: '1ª reunião', onde: 'Koalendar', tem: (c: CoordenadorAgendamento) => c.tem_link_primeira },
      { rotulo: 'acompanhamento', onde: 'Google Appointment', tem: (c: CoordenadorAgendamento) => c.tem_link_acompanhamento },
    ]
    const lista: { tom: 'falta' | 'parcial'; texto: string }[] = []
    for (const t of tipos) {
      const com = escolhidos.filter(t.tem)
      const sem = escolhidos.filter(c => !t.tem(c))
      if (sem.length === 0) continue
      if (com.length === 0) {
        lista.push({
          tom: 'falta',
          texto: `${nomes(sem)} não cadastrou o link de ${t.rotulo} (${t.onde}). Sem ele, esse tipo de reunião continua caindo na agenda de quem está ausente — peça pra preencher em Meus links de agendamento individual, logo acima.`,
        })
      } else {
        lista.push({
          tom: 'parcial',
          texto: `A reunião de ${t.rotulo} vai cair só na agenda de ${nomes(com)}, porque ${nomes(sem)} ainda não cadastrou o link (${t.onde}).`,
        })
      }
    }
    return lista
  }, [escolhidos])

  const periodoInvalido = !!inicio && !!fim && fim < inicio
  const valido = !!ausenteId && escolhidosIds.length > 0 && !!inicio && !!fim && !periodoInvalido

  async function salvar() {
    try {
      await criar.mutateAsync({
        coordenadorAusenteId: ausenteId,
        substitutoIds: escolhidosIds,
        inicio,
        fim,
        motivo,
      })
      toast.success(escolhidosIds.length > 1
        ? `Cobertura ativada com ${escolhidosIds.length} coordenadores.`
        : 'Cobertura ativada.')
      setEscolhidos([])
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
            <Select value={ausenteId} onValueChange={v => { setAusenteId(v); setEscolhidos([]) }}>
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
          {substitutos.length === 0 ? (
            <p className="text-[12.5px] text-ink-muted">
              Nenhum outro coordenador ativo pra cobrir.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {substitutos.map(c => {
                  const marcado = escolhidosIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={marcado}
                      onClick={() => alternar(c.id)}
                      className={cn(
                        'btn-press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors',
                        marcado
                          ? 'border-brand bg-brand-soft font-medium text-brand-strong'
                          : 'border-line bg-surface-canvas text-ink-secondary hover:border-line-strong',
                      )}
                    >
                      {marcado ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      {c.nome}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11.5px] leading-relaxed text-ink-subtle">
                Pode marcar mais de um — o professor vê a agenda de cada um e escolhe onde tem horário.
              </p>
            </>
          )}
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

      {recados.map(r => (
        <div
          key={r.texto}
          className={cn(
            'flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5',
            r.tom === 'falta'
              ? 'border-aviso-warnBd bg-aviso-warnBg'
              : 'border-line-soft bg-surface-subtle',
          )}
        >
          {r.tom === 'falta'
            ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-aviso-warnFg" />
            : <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-subtle" />}
          <p className="text-[12px] leading-relaxed text-ink-secondary">{r.texto}</p>
        </div>
      ))}

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

function LinhaCobertura({ grupo }: { grupo: GrupoCobertura }) {
  const encerrar = useEncerrarCobertura()
  const c = grupo.base
  const ativa = c.vigente || c.agendada
  const varios = grupo.linhas.length > 1

  /** Encerra a cobertura inteira — todos os que estão atendendo. */
  async function confirmarTudo() {
    try {
      await encerrar.mutateAsync(grupo.linhas.map(l => l.id))
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
        {grupo.linhas.map(l => (
          <ChipSubstituto
            key={l.id}
            cobertura={l}
            // Tirar um nome só faz sentido quando sobra outro atendendo: com um
            // único, o botão da direita já encerra a cobertura toda.
            podeSair={ativa && varios}
          />
        ))}
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
          onClick={confirmarTudo}
          className="btn-press ml-auto h-7 gap-1.5 px-2.5 text-[12px] text-ink-muted hover:text-ink"
        >
          {encerrar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
          {c.vigente
            ? (varios ? 'Encerrar todas' : 'Encerrar agora')
            : (varios ? 'Cancelar todas' : 'Cancelar')}
        </Button>
      )}
    </li>
  )
}

/** Um dos coordenadores que atendem. Com mais de um, cada nome pode sair da
 *  cobertura sozinho — é o caso de quem ia cobrir e também precisou se ausentar,
 *  sem derrubar a cobertura de quem ficou. */
function ChipSubstituto({ cobertura: l, podeSair }: {
  cobertura: CoberturaAgendamento
  podeSair: boolean
}) {
  const encerrar = useEncerrarCobertura()

  async function sair() {
    try {
      await encerrar.mutateAsync(l.id)
      toast.success(`${l.substituto_nome ?? 'Coordenador'} saiu da cobertura.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao tirar da cobertura.')
    }
  }

  if (!podeSair) return <span className="font-medium">{l.substituto_nome ?? '—'}</span>

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-canvas px-2 py-0.5 text-[12.5px] font-medium text-ink ring-1 ring-inset ring-line-soft">
      {l.substituto_nome ?? '—'}
      <button
        type="button"
        disabled={encerrar.isPending}
        onClick={sair}
        title={`Tirar ${l.substituto_nome ?? 'este coordenador'} da cobertura`}
        aria-label={`Tirar ${l.substituto_nome ?? 'este coordenador'} da cobertura`}
        className="btn-press -mr-0.5 rounded-full p-0.5 text-ink-subtle hover:text-ink disabled:opacity-50"
      >
        {encerrar.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
      </button>
    </span>
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
