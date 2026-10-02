import { useMemo, useState } from 'react'
import { CalendarRange, Sparkles, Info } from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useAgendas, useParticipacaoAgendas, DIAS_HISTORICO_PARTICIPACAO, type AgendaComRecorrencias,
} from '@/hooks/useAgendas'
import { useGrupos } from '@/hooks/useGrupos'
import { useAuth } from '@/contexts/AuthContext'
import {
  sugerirHorarios, mediaPresentes, umaCasa, horaLabel,
  DURACAO_GRUPO_MIN, DIAS_CURTO, DIAS_NOME,
  type HorarioFixo, type Acumulado, type Sugestao,
} from '@/lib/sugestaoAgenda'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Semana das reuniões em grupo — todos os horários recorrentes de todos os
// coordenadores numa grade de segunda a sexta, cada bloco ocupando a duração
// da reunião. Embaixo, os dias/horários sugeridos para o coordenador escolhido
// a partir da participação real (ver src/lib/sugestaoAgenda.ts).
// ─────────────────────────────────────────────────────────────────────────────

const HORA_PX = 52

type Tom = 'red' | 'yellow' | 'blue' | 'neutral'

function tomDoGrupo(nome: string | undefined): Tom {
  const n = (nome ?? '').toLowerCase()
  if (n.includes('red')) return 'red'
  if (n.includes('yellow')) return 'yellow'
  if (n.includes('blue')) return 'blue'
  return 'neutral'
}

const estiloTom = (t: Tom) => ({
  background: `var(--coord-${t}-bg)`,
  color: `var(--coord-${t}-fg)`,
  borderColor: `var(--coord-${t}-bd)`,
})

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

type Bloco =
  | { tipo: 'fixo'; key: string; dia: number; minutos: number; fixo: HorarioFixo; tom: Tom; acc: Acumulado }
  | { tipo: 'sugestao'; key: string; dia: number; minutos: number; sugestao: Sugestao; ordem: number }

/** Distribui blocos sobrepostos do mesmo dia em faixas lado a lado. */
function emFaixas(blocos: Bloco[]): { bloco: Bloco; faixa: number; faixas: number }[] {
  const ordenados = [...blocos].sort((a, b) => a.minutos - b.minutos)
  const saida: { bloco: Bloco; faixa: number; faixas: number }[] = []
  let grupo: { bloco: Bloco; faixa: number; faixas: number }[] = []
  let fimGrupo = -1
  let fimFaixas: number[] = []

  const fecharGrupo = () => {
    const n = fimFaixas.length
    grupo.forEach(g => { g.faixas = n })
    saida.push(...grupo)
    grupo = []
    fimFaixas = []
  }

  for (const b of ordenados) {
    if (grupo.length && b.minutos >= fimGrupo) fecharGrupo()
    let faixa = fimFaixas.findIndex(fim => fim <= b.minutos)
    if (faixa === -1) { faixa = fimFaixas.length; fimFaixas.push(0) }
    fimFaixas[faixa] = b.minutos + DURACAO_GRUPO_MIN
    fimGrupo = Math.max(fimGrupo, b.minutos + DURACAO_GRUPO_MIN)
    grupo.push({ bloco: b, faixa, faixas: 0 })
  }
  if (grupo.length) fecharGrupo()
  return saida
}

export function SemanaCoordenadoresCard() {
  const { profile } = useAuth()
  const { data: agendas = [], isLoading: carregandoAgendas } = useAgendas()
  const { data: ocorrencias = [], isLoading: carregandoParticipacao } = useParticipacaoAgendas()
  const { data: grupos = [] } = useGrupos()

  const [mostrarPausados, setMostrarPausados] = useState(false)

  // Coordenadores que têm agenda + quem está olhando (pode ainda não ter agenda).
  const coordenadores = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of agendas) if (a.coordenador) m.set(a.coordenador.id, a.coordenador.nome)
    if (profile?.id && !m.has(profile.id)) m.set(profile.id, profile.nome ?? 'Você')
    return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [agendas, profile])

  const [paraId, setParaId] = useState<string | null>(null)
  const alvoId = paraId ?? profile?.id ?? null

  const tomPorCoord = useMemo(() => {
    const m = new Map<string, Tom>()
    for (const g of grupos) if (g.coordenador_id) m.set(g.coordenador_id, tomDoGrupo(g.nome))
    return m
  }, [grupos])

  const fixos = useMemo(() => horariosFixos(agendas), [agendas])

  // Histórico de cada bloco = reuniões daquela recorrência que caíram no MESMO
  // dia e hora de hoje. Recorrência que mudou de horário (ex.: 14h → 16h) não
  // empresta o histórico do horário antigo.
  const accPorBloco = useMemo(() => {
    const m = new Map<string, Acumulado>()
    for (const o of ocorrencias) {
      if (!o.recorrenciaId) continue
      const k = `${o.recorrenciaId}-${o.dia}-${o.hora}`
      const a = m.get(k) ?? { reunioes: 0, presentes: 0, inscritos: 0 }
      a.reunioes += 1; a.presentes += o.presentes; a.inscritos += o.inscritos
      m.set(k, a)
    }
    return m
  }, [ocorrencias])

  const { sugestoes, geral } = useMemo(
    () => sugerirHorarios({ ocorrencias, fixos, meuId: alvoId }),
    [ocorrencias, fixos, alvoId],
  )

  const visiveis = fixos.filter(f => f.ativo || mostrarPausados)

  const blocos: Bloco[] = [
    ...visiveis.map(f => ({
      tipo: 'fixo' as const,
      key: f.recorrenciaId,
      dia: f.dia,
      minutos: f.minutos,
      fixo: f,
      tom: (f.coordenadorId && tomPorCoord.get(f.coordenadorId)) || 'neutral',
      acc: accPorBloco.get(`${f.recorrenciaId}-${f.dia}-${Math.floor(f.minutos / 60)}`) ?? { reunioes: 0, presentes: 0, inscritos: 0 },
    })),
    ...sugestoes.slice(0, 2).map((s, i) => ({
      tipo: 'sugestao' as const,
      key: `sug-${s.dia}-${s.hora}`,
      dia: s.dia,
      minutos: s.hora * 60,
      sugestao: s,
      ordem: i + 1,
    })),
  ]

  // Segunda a sexta sempre; fim de semana só se houver horário lá.
  const dias = [1, 2, 3, 4, 5, ...[6, 0].filter(d => blocos.some(b => b.dia === d))]
  const inicioH = Math.min(8, ...blocos.map(b => Math.floor(b.minutos / 60)))
  const fimH = Math.max(18, ...blocos.map(b => Math.ceil((b.minutos + DURACAO_GRUPO_MIN) / 60)))
  const horas = Array.from({ length: fimH - inicioH }, (_, i) => inicioH + i)

  const resumoCoord = coordenadores
    .map(c => {
      const ativos = fixos.filter(f => f.ativo && f.coordenadorId === c.id)
      const pausados = fixos.filter(f => !f.ativo && f.coordenadorId === c.id)
      return { ...c, ativos: ativos.length, pausados: pausados.length, tom: tomPorCoord.get(c.id) ?? 'neutral' as Tom }
    })
    .filter(c => c.ativos + c.pausados > 0)

  const nomeAlvo = coordenadores.find(c => c.id === alvoId)?.nome ?? 'você'
  const souEu = !alvoId || alvoId === profile?.id

  return (
    <section className="card-surface p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accentBlue-soft text-accentBlue">
            <CalendarRange className="h-3.5 w-3.5" />
          </span>
          <div className="space-y-0.5">
            <h2 className="text-[15px] font-semibold text-ink">Semana das reuniões em grupo</h2>
            <p className="text-[12px] text-ink-muted">
              Horários recorrentes de todos os coordenadores. Cada bloco ocupa {DURACAO_GRUPO_MIN / 60}h — a duração não é cadastrada na agenda.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-ink-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={mostrarPausados}
            onChange={e => setMostrarPausados(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent-blue)]"
          />
          Mostrar horários pausados
        </label>
      </div>

      {/* Legenda: um chip por coordenador, com a carga semanal. */}
      <div className="flex flex-wrap gap-2">
        {resumoCoord.map(c => (
          <span key={c.id} className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11.5px]" style={estiloTom(c.tom)}>
            <span className="font-semibold">{primeiroNome(c.nome)}</span>
            <span className="opacity-80">
              {c.ativos ? `${plural(c.ativos, 'horário ativo', 'horários ativos')} · ${c.ativos * DURACAO_GRUPO_MIN / 60}h/semana` : 'sem horário ativo'}
              {c.pausados ? ` · ${c.pausados} pausado${c.pausados === 1 ? '' : 's'}` : ''}
            </span>
          </span>
        ))}
        {sugestoes.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-aviso-okBd bg-aviso-okBg px-2.5 py-1 text-[11.5px] text-aviso-okFg">
            <Sparkles className="h-3 w-3" /> Sugestão para {souEu ? 'você' : primeiroNome(nomeAlvo)}
          </span>
        )}
      </div>

      {carregandoAgendas ? (
        <div className="rounded-xl border border-line-soft p-10 text-center text-[13px] text-ink-muted">Carregando…</div>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-[620px]">
            {/* Cabeçalho dos dias */}
            <div className="grid" style={{ gridTemplateColumns: `44px repeat(${dias.length}, minmax(0, 1fr))` }}>
              <div />
              {dias.map(d => (
                <div key={d} className="pb-2 text-center text-[11.5px] font-semibold uppercase tracking-wide text-ink-secondary">
                  {DIAS_CURTO[d]}
                </div>
              ))}
            </div>

            <div className="grid rounded-xl border border-line-soft" style={{ gridTemplateColumns: `44px repeat(${dias.length}, minmax(0, 1fr))` }}>
              {/* Régua de horas */}
              <div className="relative" style={{ height: horas.length * HORA_PX }}>
                {horas.map((h, i) => (
                  <span
                    key={h}
                    className="absolute right-2 -translate-y-1/2 text-[10.5px] tabular-nums text-ink-muted"
                    style={{ top: i * HORA_PX }}
                  >
                    {i === 0 ? '' : `${h}h`}
                  </span>
                ))}
              </div>

              {dias.map(d => (
                <div key={d} className="relative border-l border-line-soft" style={{ height: horas.length * HORA_PX }}>
                  {horas.map((h, i) => i > 0 && (
                    <div key={h} className="absolute inset-x-0 border-t border-line-soft" style={{ top: i * HORA_PX }} />
                  ))}
                  {emFaixas(blocos.filter(b => b.dia === d)).map(({ bloco, faixa, faixas }) => (
                    <BlocoView
                      key={bloco.key}
                      bloco={bloco}
                      top={(bloco.minutos - inicioH * 60) / 60 * HORA_PX}
                      left={`calc(${(faixa / faixas) * 100}% + 2px)`}
                      width={`calc(${100 / faixas}% - 4px)`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Sugestões ─────────────────────────────────────────────────────── */}
      <div className="space-y-3 border-t border-line-soft pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-aviso-okFg" />
            <h3 className="text-[14px] font-semibold text-ink">
              Melhores dias para {souEu ? 'as suas reuniões' : `as reuniões de ${primeiroNome(nomeAlvo)}`}
            </h3>
          </div>
          {coordenadores.length > 1 && (
            <Select value={alvoId ?? undefined} onValueChange={setParaId}>
              <SelectTrigger size="sm" className="w-56 bg-surface-canvas border-line text-ink text-[12px]">
                <SelectValue placeholder="Sugerir para…" />
              </SelectTrigger>
              <SelectContent className="bg-surface-canvas border-line text-ink">
                {coordenadores.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-[12px]">
                    Sugerir para {c.id === profile?.id ? 'mim' : primeiroNome(c.nome)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {carregandoParticipacao ? (
          <p className="text-[12.5px] text-ink-muted">Lendo a participação das reuniões…</p>
        ) : !sugestoes.length ? (
          <p className="text-[12.5px] text-ink-muted">
            Ainda não há reuniões em grupo com presença registrada nos últimos {DIAS_HISTORICO_PARTICIPACAO} dias para sugerir horários.
          </p>
        ) : (
          <ol className="grid gap-3 md:grid-cols-3">
            {sugestoes.map((s, i) => <SugestaoCard key={`${s.dia}-${s.hora}`} sugestao={s} ordem={i + 1} geral={geral} />)}
          </ol>
        )}

        {geral.reunioes > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-line-soft bg-surface-subtle/50 px-3 py-2.5">
            <Info className="h-3.5 w-3.5 text-ink-muted mt-0.5 flex-shrink-0" />
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              <span className="font-medium text-ink-secondary">Como lemos os números.</span>{' '}
              Base: {plural(geral.reunioes, 'reunião em grupo', 'reuniões em grupo')} dos últimos {DIAS_HISTORICO_PARTICIPACAO} dias,
              de todos os coordenadores, contando também os horários que ficaram sem inscrito —
              {' '}{geral.presentes} presenças de {geral.inscritos} inscrições, média de {umaCasa(mediaPresentes(geral))} presentes por reunião.
              {' '}Presente = professor marcado como “realizada” na reunião.
              {' '}A estimativa de cada dia e hora mistura a média daquele horário com a média do dia e a da hora em geral:
              quanto menos reuniões o horário teve, mais pesa a média geral.
              {' '}Entram como candidatas as horas cheias que já tiveram pelo menos 3 reuniões, de segunda a sexta, um horário por dia.
              {' '}Fica de fora qualquer horário que se sobreponha a um horário <span className="font-medium">ativo</span> de outro coordenador (encostar não conta).
              {' '}Presença também depende de quem convida — cada coordenador fala com o próprio grupo —, então trate como ponto de partida, não como garantia.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Dados ──────────────────────────────────────────────────────────────────

function horariosFixos(agendas: AgendaComRecorrencias[]): HorarioFixo[] {
  return agendas.flatMap(a => a.recorrencias.map(r => {
    const [h, m] = r.hora.split(':').map(Number)
    return {
      recorrenciaId: r.id,
      dia: r.dia_semana,
      minutos: h * 60 + (m || 0),
      coordenadorId: a.coordenador?.id ?? null,
      coordenadorNome: a.coordenador?.nome ?? 'Sem coordenador',
      ativo: a.ativo && r.ativo,
    }
  }))
}

// ─── Bloco da grade ─────────────────────────────────────────────────────────

function BlocoView({ bloco, top, left, width }: { bloco: Bloco; top: number; left: string; width: string }) {
  const height = DURACAO_GRUPO_MIN / 60 * HORA_PX - 3
  const fim = bloco.minutos + DURACAO_GRUPO_MIN

  if (bloco.tipo === 'sugestao') {
    return (
      <div
        className="absolute z-10 overflow-hidden rounded-lg border-2 border-dashed border-aviso-okFg bg-aviso-okBg px-1.5 py-1 text-aviso-okFg"
        style={{ top: top + 1, left, width, height }}
        title={`Sugestão ${bloco.ordem}: ${DIAS_NOME[bloco.dia]}, ${horaLabel(bloco.minutos)}–${horaLabel(fim)} · ≈${umaCasa(bloco.sugestao.estimativa)} presentes por reunião`}
      >
        <p className="flex items-center gap-1 truncate text-[11px] font-semibold leading-tight">
          <Sparkles className="h-3 w-3 flex-shrink-0" /> Sugestão {bloco.ordem}
        </p>
        <p className="truncate text-[10.5px] leading-tight opacity-90">
          {horaLabel(bloco.minutos)} · ≈{umaCasa(bloco.sugestao.estimativa)}/reunião
        </p>
      </div>
    )
  }

  const { fixo, acc, tom } = bloco
  const media = acc.reunioes ? `${umaCasa(mediaPresentes(acc))} pres./reunião` : 'sem histórico'
  return (
    <div
      className={cn(
        'absolute overflow-hidden rounded-lg border px-1.5 py-1',
        !fixo.ativo && 'border-dashed opacity-60',
      )}
      style={{ ...estiloTom(tom), top: top + 1, left, width, height }}
      title={[
        `${fixo.coordenadorNome} — ${DIAS_NOME[fixo.dia]}, ${horaLabel(fixo.minutos)}–${horaLabel(fim)}${fixo.ativo ? '' : ' (pausado)'}`,
        acc.reunioes
          ? `${acc.presentes} presentes em ${plural(acc.reunioes, 'reunião', 'reuniões')} (${acc.inscritos} inscrições), últimos ${DIAS_HISTORICO_PARTICIPACAO} dias`
          : `Nenhuma reunião passada neste dia e hora nos últimos ${DIAS_HISTORICO_PARTICIPACAO} dias`,
      ].join('\n')}
    >
      <p className="truncate text-[11px] font-semibold leading-tight">
        {primeiroNome(fixo.coordenadorNome)} · {horaLabel(fixo.minutos)}{!fixo.ativo && ' · pausado'}
      </p>
      <p className="truncate text-[10.5px] leading-tight opacity-85">{media}</p>
    </div>
  )
}

// ─── Card de sugestão ───────────────────────────────────────────────────────

function SugestaoCard({ sugestao: s, ordem, geral }: { sugestao: Sugestao; ordem: number; geral: Acumulado }) {
  const inicio = s.hora * 60
  const fim = inicio + DURACAO_GRUPO_MIN
  const nomeDia = DIAS_NOME[s.dia]
  const acimaDaMedia = s.estimativa - mediaPresentes(geral)

  return (
    <li className={cn(
      'rounded-xl border p-3.5 space-y-2.5',
      ordem <= 2 ? 'border-aviso-okBd' : 'border-line-soft',
    )}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-ink capitalize">
          <span className="mr-1.5 text-ink-muted tabular-nums">{ordem}.</span>
          {nomeDia}, {horaLabel(inicio)}–{horaLabel(fim)}
        </p>
        {ordem > 2 && <span className="text-[10.5px] text-ink-muted">alternativa</span>}
      </div>

      <span className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-medium',
        s.par.reunioes >= 3 ? 'bg-aviso-okBg text-aviso-okFg' : 'bg-aviso-infoBg text-aviso-infoFg',
      )}>
        {s.par.reunioes === 0
          ? 'Nunca testado neste dia e hora'
          : s.par.reunioes < 3
            ? `Pouco testado: ${plural(s.par.reunioes, 'reunião', 'reuniões')}`
            : `Testado: ${plural(s.par.reunioes, 'reunião', 'reuniões')} neste dia e hora`}
      </span>

      <div>
        <p className="text-[22px] font-semibold tabular-nums leading-none text-ink">≈{umaCasa(s.estimativa)}</p>
        <p className="mt-1 text-[11.5px] text-ink-muted">
          presentes por reunião (estimativa) — {acimaDaMedia >= 0 ? `${umaCasa(acimaDaMedia)} acima` : `${umaCasa(-acimaDaMedia)} abaixo`} da média geral de {umaCasa(mediaPresentes(geral))}
        </p>
      </div>

      <ul className="space-y-1 text-[11.5px] leading-snug text-ink-secondary">
        <li>
          {s.par.reunioes
            ? <>Neste dia e hora: {s.par.presentes} presentes em {plural(s.par.reunioes, 'reunião', 'reuniões')} ({umaCasa(mediaPresentes(s.par))} por reunião).</>
            : <>Ainda não houve reunião em grupo às {horaLabel(inicio)} de {nomeDia} — a estimativa vem do dia e da hora.</>}
        </li>
        <li>
          {s.doDia.reunioes
            ? <>Às {nomeDia}s: {umaCasa(mediaPresentes(s.doDia))} por reunião ({s.doDia.presentes} presentes em {plural(s.doDia.reunioes, 'reunião', 'reuniões')}).</>
            : <>Sem reunião em grupo às {nomeDia}s no período.</>}
          {' '}Às {horaLabel(inicio)}: {umaCasa(mediaPresentes(s.daHora))} por reunião ({s.daHora.presentes} presentes em {plural(s.daHora.reunioes, 'reunião', 'reuniões')}).
        </li>
        <li className="text-ink-muted">
          {s.mesmoDia.length
            ? <>Sem conflito. No mesmo dia: {s.mesmoDia.map(f => (
                `${primeiroNome(f.coordenadorNome)} ${horaLabel(f.minutos)}–${horaLabel(f.minutos + DURACAO_GRUPO_MIN)}`
                + (Math.abs(f.minutos - inicio) === DURACAO_GRUPO_MIN ? ' (colado, sem intervalo)' : '')
              )).join(', ')}.</>
            : <>Nenhum outro coordenador tem reunião em grupo ativa na {nomeDia}.</>}
        </li>
      </ul>
    </li>
  )
}
