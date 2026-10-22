import { useMemo, useState } from 'react'
import {
  Search, Download, MessageCircle, Lock, CheckCircle2, Unlock, Send, Clock3, ChevronRight, UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { dataBR, fmtDuracao } from '@/lib/formato'
import { useAuth } from '@/contexts/AuthContext'
import { podeGerirTrilha } from '@/lib/permissions'
import {
  ULTIMAS_HORAS_MS, dataHoraBR, fmtHaQuanto, fmtRestanteCurto, type SituacaoTrilha,
} from '@/lib/prazoTrilha'
import { useConfigTrilha, useConvidarTrilha, type EtapaAdmin } from '@/hooks/useWelcomePathAdmin'
import { LinkTrilha } from './LinkTrilha'
import { ProfessorTrilhaDialog } from './ProfessorTrilhaDialog'
import { FECHADAS, SITUACAO, ehTeste, norm, useLinhasTrilha, type LinhaTrilha } from './trilhaComum'
import { ChipSituacao, LegendaPontos, PontosEtapas } from './TrilhaUI'

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Professores" da área Welcome Path: onde cada um está na trilha.
//
// Desde 22/10/2026 só aparece quem foi liberado na aba Acesso (o grupo do RH)
// ou dispensado; no modo "todos", também o ativo que entrou na King desde
// 07/10/2026. A lista vem pronta de `wp_acompanhamento()`; só a SITUAÇÃO é
// decidida aqui, porque depende do relógio — e o relógio anda com a tela aberta.
//
// De cima para baixo: o que pede ação agora, o funil por fase (clicar filtra),
// e a lista com uma bolinha por etapa. O painel do professor abre ao lado.
// ─────────────────────────────────────────────────────────────────────────────

type Fase = 'sem_convite' | 'convidado' | 'fazendo' | 'concluiu' | 'reuniao'
type Filtro = 'abertos' | 'todos' | 'bloqueado' | 'dispensado' | 'revisao' | Fase

const FASES: { id: Fase; label: string; regra: string; situacoes: SituacaoTrilha[] }[] = [
  { id: 'sem_convite', label: 'Liberado',       regra: 'ainda sem o convite',         situacoes: ['sem_convite'] },
  { id: 'convidado',   label: 'Convidado',      regra: 'recebeu e não abriu',         situacoes: ['convidado'] },
  { id: 'fazendo',     label: 'Fazendo',        regra: 'abriu, inclui bloqueados',    situacoes: ['andamento', 'acabando', 'bloqueado'] },
  { id: 'concluiu',    label: 'Concluiu',       regra: 'falta a 1ª reunião',          situacoes: ['falta_reuniao'] },
  { id: 'reuniao',     label: 'Com 1ª reunião', regra: 'concluiu e fez a reunião',    situacoes: ['finalizado'] },
]

function mediana(v: number[]): number | null {
  if (!v.length) return null
  const o = [...v].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

function passaFiltro(l: LinhaTrilha, filtro: Filtro): boolean {
  if (filtro === 'todos') return true
  if (filtro === 'abertos') return !FECHADAS.includes(l.situacao)
  if (filtro === 'revisao') return l.revisoes_pendentes > 0
  if (filtro === 'bloqueado' || filtro === 'dispensado') return l.situacao === filtro
  return FASES.find(f => f.id === filtro)!.situacoes.includes(l.situacao)
}

/** A coluna "Prazo": o que importa sobre o relógio em cada situação. */
function TextoPrazo({ l, agora }: { l: LinhaTrilha; agora: number }) {
  if (l.situacao === 'dispensado' && l.dispensado_em) {
    return (
      <span className="text-ink-muted" title={l.motivo_dispensa ?? undefined}>
        dispensado em {dataBR(l.dispensado_em.slice(0, 10))}{l.dispensado_por && ` por ${l.dispensado_por.split(' ')[0]}`}
      </span>
    )
  }
  if (l.situacao === 'sem_convite' || l.situacao === 'convidado') {
    // Mexeu na trilha antes de 07/10/2026, quando ainda não havia relógio.
    if (l.tempo_segundos > 0 || l.etapas_concluidas > 0) {
      return <span className="text-ink-muted">abriu antes do prazo existir</span>
    }
    return <span className="text-ink-subtle">relógio parado</span>
  }
  if (l.concluida_em && l.primeiro_acesso_em) {
    const levou = new Date(l.concluida_em).getTime() - new Date(l.primeiro_acesso_em).getTime()
    return <span className="text-ink-secondary" title={`Concluiu ${dataHoraBR(l.concluida_em)}`}>concluiu em {fmtRestanteCurto(levou)}</span>
  }
  if (!l.prazo_em) return <span className="text-ink-subtle">—</span>
  const restante = new Date(l.prazo_em).getTime() - agora
  if (restante <= 0) {
    return (
      <span className={l.situacao === 'bloqueado' ? 'font-medium text-aviso-warnFg' : 'text-ink-muted'} title={`Prazo: ${dataHoraBR(l.prazo_em)}`}>
        esgotou {fmtHaQuanto(-restante)}{l.so_falta_revisao && ' · em revisão'}
      </span>
    )
  }
  return (
    <span
      className={cn('tabular-nums', restante <= ULTIMAS_HORAS_MS ? 'font-medium text-urg-medFg' : 'text-ink-secondary')}
      title={`Prazo: ${dataHoraBR(l.prazo_em)}`}
    >
      faltam {fmtRestanteCurto(restante)}
    </span>
  )
}

/** A coluna "1ª reunião". */
function TextoReuniao({ l }: { l: LinhaTrilha }) {
  if (l.primeira_reuniao_em) {
    return <span className="text-aviso-okFg">feita em {dataBR(l.primeira_reuniao_em)}</span>
  }
  if (l.reuniao_marcada_em) {
    return <span className="text-ink-secondary">marcada · {dataHoraBR(l.reuniao_marcada_em)}</span>
  }
  if (l.concluida_em) return <span className="font-medium text-aviso-infoFg">não agendou</span>
  return <span className="text-ink-subtle">—</span>
}

/** A coluna "Etapas": bolinhas para quem já abriu; o passo do convite para quem não. */
function CelulaEtapas({ l, ativas }: { l: LinhaTrilha; ativas: EtapaAdmin[] }) {
  const abriu = !!l.primeiro_acesso_em || l.porEtapa.size > 0
  if (!abriu) {
    if (l.convite_em) {
      return <span className="text-[12px] text-ink-muted">convite em {dataHoraBR(l.convite_em)} · não abriu</span>
    }
    if (l.liberado_em) {
      return (
        <span className="text-[12px] text-ink-muted">
          liberado em {dataBR(l.liberado_em.slice(0, 10))}{l.liberado_por && ` por ${l.liberado_por.split(' ')[0]}`}
        </span>
      )
    }
    return <span className="text-[12px] text-ink-subtle">—</span>
  }
  return (
    <div className="min-w-[170px] space-y-1">
      <PontosEtapas l={l} ativas={ativas} />
      <p className="truncate text-[11.5px] text-ink-muted" title={l.etapa_atual_titulo ?? undefined}>
        {l.concluida_em
          ? `Todas concluídas · ${l.etapas_concluidas}/${l.etapas_obrigatorias}`
          : l.etapa_atual_numero
            ? `Etapa ${l.etapa_atual_numero} · ${l.etapa_atual_titulo} · ${l.etapas_concluidas}/${l.etapas_obrigatorias}`
            : `${l.etapas_concluidas}/${l.etapas_obrigatorias}`}
      </p>
    </div>
  )
}

function BotaoConvidar({ l }: { l: LinhaTrilha }) {
  const convidar = useConvidarTrilha()
  return (
    <Button
      size="sm" variant="outline"
      className="btn-press h-7 gap-1 border-line px-2.5 text-[11.5px]"
      disabled={convidar.isPending}
      onClick={ev => {
        ev.stopPropagation()
        convidar.mutate(l.professor_id, {
          onSuccess: r => toast.success(`Convite enviado para ${r.para}`),
          onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível enviar o convite.'),
        })
      }}
    >
      <Send className="h-3 w-3" /> {convidar.isPending ? 'Enviando…' : 'Enviar convite'}
    </Button>
  )
}

export function WelcomePathTab({ onIrAcesso }: { onIrAcesso: () => void }) {
  const { profile } = useAuth()
  const podeGerir = podeGerirTrilha(profile)
  const { linhas, ativas, etapas, carregando, agora } = useLinhasTrilha()
  const { data: config } = useConfigTrilha()
  const soLiberados = config?.so_liberados ?? true

  const [filtro, setFiltro] = useState<Filtro>('abertos')
  const [grupo, setGrupo] = useState<string>('todos')
  const [rotulo, setRotulo] = useState<string>('todos')
  const [busca, setBusca] = useState('')
  const [comTeste, setComTeste] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)

  const nTeste = linhas.filter(l => ehTeste(l.nome)).length
  const grupos = useMemo(
    () => [...new Set(linhas.map(l => l.grupo).filter((g): g is string => !!g))].sort(),
    [linhas],
  )
  const rotulos = useMemo(
    () => [...new Set(linhas.map(l => l.rotulo).filter((r): r is string => !!r))].sort(),
    [linhas],
  )

  /** Recorte de coordenação, turma e contas de teste: base dos números e dos filtros. */
  const escopo = useMemo(
    () => linhas
      .filter(l => comTeste || !ehTeste(l.nome))
      .filter(l => grupo === 'todos' || l.grupo === grupo)
      .filter(l => rotulo === 'todos' || (rotulo === '' ? !l.rotulo : l.rotulo === rotulo)),
    [linhas, comTeste, grupo, rotulo],
  )

  const conta = (f: Filtro) => escopo.filter(l => passaFiltro(l, f)).length

  const numeros = useMemo(() => {
    // Dispensado não conta: a trilha deixou de valer para ele.
    const abriram = escopo.filter(l => l.primeiro_acesso_em && l.situacao !== 'dispensado')
    const concluiram = abriram.filter(l => l.concluida_em)
    const tempos = concluiram.map(l => new Date(l.concluida_em!).getTime() - new Date(l.primeiro_acesso_em!).getTime())
    return {
      abriram: abriram.length,
      concluiram: concluiram.length,
      medianaMs: mediana(tempos),
      respostas: escopo.reduce((s, l) => s + l.revisoes_pendentes, 0),
    }
  }, [escopo])

  const visiveis = useMemo(() => {
    const q = norm(busca)
    return escopo
      .filter(l => passaFiltro(l, filtro))
      .filter(l => q.length === 0 || norm(l.nome).includes(q))
      .sort((a, b) => {
        const pa = SITUACAO[a.situacao].peso, pb = SITUACAO[b.situacao].peso
        if (pa !== pb) return pa - pb
        // Dentro da situação: quem tem menos prazo (ou entrou antes) primeiro.
        const ka = a.prazo_em ?? a.data_inicio ?? ''
        const kb = b.prazo_em ?? b.data_inicio ?? ''
        return ka.localeCompare(kb)
      })
  }, [escopo, filtro, busca])

  async function exportar() {
    const XLSX = await import('xlsx')
    const dados = visiveis.map(l => ({
      Professor: l.nome,
      Coordenação: [l.grupo, l.coordenador].filter(Boolean).join(' · '),
      Turma: l.rotulo ?? '',
      Situação: SITUACAO[l.situacao].label,
      'Entrou na King': l.data_inicio ? dataBR(l.data_inicio) : '',
      Liberado: l.liberado_em ? [dataHoraBR(l.liberado_em), l.liberado_por && `por ${l.liberado_por}`].filter(Boolean).join(' · ') : '',
      Convite: l.convite_em ? `${dataHoraBR(l.convite_em)} · ${l.convite_manual ? `por ${l.convite_por ?? '—'}` : 'automático'}` : '',
      '1º acesso': l.primeiro_acesso_em ? dataHoraBR(l.primeiro_acesso_em) : '',
      Prazo: l.prazo_em ? dataHoraBR(l.prazo_em) : '',
      Desbloqueios: l.desbloqueios,
      Etapas: `${l.etapas_concluidas}/${l.etapas_obrigatorias}`,
      'Etapa atual': l.concluida_em ? 'Concluiu' : l.etapa_atual_numero ? `${l.etapa_atual_numero} · ${l.etapa_atual_titulo}` : '',
      'Respostas para revisar': l.revisoes_pendentes,
      'Concluiu em': l.concluida_em ? dataHoraBR(l.concluida_em) : '',
      '1ª reunião': l.primeira_reuniao_em ? `feita ${dataBR(l.primeira_reuniao_em)}` : l.reuniao_marcada_em ? `marcada ${dataHoraBR(l.reuniao_marcada_em)}` : '',
      'Tempo de estudo': fmtDuracao(l.tempo_segundos),
      Dispensa: l.dispensado_em
        ? [dataBR(l.dispensado_em.slice(0, 10)), l.dispensado_por && `por ${l.dispensado_por}`, l.motivo_dispensa].filter(Boolean).join(' · ')
        : '',
      'E-mail': l.email ?? '',
      Telefone: l.telefone ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(dados)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Welcome Path')
    XLSX.writeFile(wb, `welcome-path-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const linhaAberta = aberto ? linhas.find(l => l.professor_id === aberto) ?? null : null
  const alternar = (f: Filtro) => setFiltro(atual => (atual === f ? 'abertos' : f))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-ink-muted">
          {soLiberados
            ? 'Só quem foi liberado na aba Acesso aparece aqui e consegue entrar na trilha. '
            : 'A trilha está aberta a todos: quem entrou na King desde 07/10/2026 aparece aqui sozinho. '}
          Cada professor tem 5 dias, contados do primeiro acesso, para concluir. Quando o prazo acaba, a trilha
          trava e ele pede o desbloqueio pelo WhatsApp.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <LinkTrilha />
          <Button size="sm" variant="outline" className="btn-press h-9 gap-1.5 border-line" onClick={exportar}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
        </div>
      </div>

      {/* Pede ação agora — cada cartão diz o que conta e, clicado, filtra a lista. */}
      <section className="space-y-2">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">Pede ação agora</h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line-soft bg-line-soft lg:grid-cols-4">
          <CartaoAcao
            icone={Send}
            rotulo="Liberados sem convite"
            valor={conta('sem_convite')}
            regra="liberados que ainda não receberam o e-mail"
            ativo={filtro === 'sem_convite'}
            onClick={() => alternar('sem_convite')}
          />
          <CartaoAcao
            icone={Lock}
            rotulo="Bloqueados"
            valor={conta('bloqueado')}
            regra="o prazo de 5 dias acabou sem concluir"
            tom="alerta"
            ativo={filtro === 'bloqueado'}
            onClick={() => alternar('bloqueado')}
          />
          <CartaoAcao
            icone={Clock3}
            rotulo="Esperando revisão"
            valor={conta('revisao')}
            regra={numeros.respostas
              ? `${numeros.respostas} ${numeros.respostas === 1 ? 'etapa com dissertativa' : 'etapas com dissertativa'} sem nota`
              : 'dissertativa sem nota trava a etapa seguinte'}
            tom="atencao"
            ativo={filtro === 'revisao'}
            onClick={() => alternar('revisao')}
          />
          <CartaoAcao
            icone={CheckCircle2}
            rotulo="Concluíram sem 1ª reunião"
            valor={conta('concluiu')}
            regra="todas as etapas, sem reunião feita"
            ativo={filtro === 'concluiu'}
            onClick={() => alternar('concluiu')}
          />
        </div>
      </section>

      {/* Funil por fase */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-stretch gap-1">
          {FASES.map((f, i) => (
            <div key={f.id} className="flex min-w-[120px] flex-1 items-center gap-1">
              <button
                type="button"
                onClick={() => alternar(f.id)}
                className={cn(
                  'btn-press flex-1 rounded-xl border px-3 py-2 text-left transition-colors',
                  filtro === f.id ? 'border-accentBlue bg-accentBlue-soft' : 'border-line-soft hover:bg-surface-subtle',
                )}
              >
                <span className="block text-[1.15rem] font-semibold leading-tight tabular-nums text-ink">{conta(f.id)}</span>
                <span className="block text-[12px] font-medium text-ink">{f.label}</span>
                <span className="block text-[11px] text-ink-muted">{f.regra}</span>
              </button>
              {i < FASES.length - 1 && <ChevronRight className="hidden h-4 w-4 flex-shrink-0 text-ink-subtle md:block" />}
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-ink-muted">
          {numeros.abriram
            ? `Concluíram ${numeros.concluiram} de ${numeros.abriram} que abriram a trilha`
            : 'Ninguém abriu a trilha ainda'}
          {numeros.medianaMs != null && ` · tempo mediano do 1º acesso à última etapa: ${fmtRestanteCurto(numeros.medianaMs)}`}
          {' · '}Fora do funil: {conta('dispensado')} {conta('dispensado') === 1 ? 'dispensado' : 'dispensados'}.
        </p>
      </section>

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            ['abertos', 'Em aberto'],
            ['todos', 'Todos'],
            ['dispensado', 'Dispensados'],
          ] as [Filtro, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFiltro(id)}
              className={cn(
                'btn-press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                filtro === id ? 'bg-surface-subtle text-ink' : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink',
              )}
            >
              {label}
              <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-surface-subtle px-1 text-[10.5px] tabular-nums text-ink-muted">
                {conta(id)}
              </span>
            </button>
          ))}
          {!['abertos', 'todos', 'dispensado'].includes(filtro) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accentBlue-soft px-3 py-1.5 text-[12px] font-medium text-accentBlue">
              Filtro: {filtro === 'revisao' ? 'Esperando revisão' : filtro === 'bloqueado' ? 'Bloqueados' : FASES.find(f => f.id === filtro)?.label}
              <button className="ml-1 hover:text-ink" onClick={() => setFiltro('abertos')} aria-label="Limpar filtro">×</button>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rotulos.length > 0 && (
            <select
              value={rotulo}
              onChange={e => setRotulo(e.target.value)}
              aria-label="Turma"
              className="h-9 rounded-xl border border-line bg-surface-canvas px-3 text-[12.5px] text-ink"
            >
              <option value="todos">Todas as turmas</option>
              {rotulos.map(r => <option key={r} value={r}>{r}</option>)}
              <option value="">Sem turma</option>
            </select>
          )}
          {grupos.length > 1 && (
            <select
              value={grupo}
              onChange={e => setGrupo(e.target.value)}
              aria-label="Coordenação"
              className="h-9 rounded-xl border border-line bg-surface-canvas px-3 text-[12.5px] text-ink"
            >
              <option value="todos">Todas as coordenações</option>
              {grupos.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar professor…"
              className="h-9 w-[220px] rounded-xl border-line bg-surface-canvas pl-9 text-[13px]"
            />
          </div>
        </div>
      </div>

      {nTeste > 0 && (
        <label className="-mt-3 flex w-fit cursor-pointer items-center gap-2 text-[12px] text-ink-secondary">
          <input
            type="checkbox"
            checked={comTeste}
            onChange={e => setComTeste(e.target.checked)}
            className="h-3.5 w-3.5 accent-current"
          />
          Incluir contas de teste ({nTeste})
        </label>
      )}

      {carregando ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">Carregando…</div>
      ) : ativas.length === 0 && etapas.length > 0 ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">
          Nenhuma etapa ativa na trilha. Publique o conteúdo na aba "Conteúdo".
        </div>
      ) : escopo.length === 0 && soLiberados ? (
        <div className="card-surface space-y-3 p-10 text-center">
          <p className="text-[13px] text-ink-muted">Ninguém liberado para a trilha ainda.</p>
          {podeGerir && (
            <Button size="sm" className="btn-press h-9 gap-1.5" onClick={onIrAcesso}>
              <UserPlus className="h-4 w-4" /> Liberar professores
            </Button>
          )}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">
          {busca ? `Nenhum professor encontrado para "${busca}".` : 'Ninguém nesta situação agora.'}
        </div>
      ) : (
        <div className="space-y-2">
          <LegendaPontos />
          <div className="card-surface overflow-hidden">
            <div className="relative max-h-[calc(100vh-300px)] min-h-[260px] w-full overflow-auto overscroll-contain">
              <table className="w-full caption-bottom">
                <thead className="sticky top-0 z-10 bg-surface-canvas shadow-[0_1px_0_0_var(--border-soft)]">
                  <tr>
                    <Th>Professor</Th>
                    <Th>Etapas</Th>
                    <Th>Situação</Th>
                    <Th>Prazo</Th>
                    <Th>1ª reunião</Th>
                    <th className="h-10 px-3" />
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(l => (
                    <tr
                      key={l.professor_id}
                      className={cn(
                        'cursor-pointer border-b border-line-soft transition-colors hover:bg-surface-subtle',
                        l.situacao === 'bloqueado' && 'shadow-[inset_2px_0_0_0_var(--aviso-warn-fg)]',
                        l.situacao === 'acabando' && 'shadow-[inset_2px_0_0_0_var(--urg-med-fg)]',
                        aberto === l.professor_id && 'bg-surface-subtle',
                      )}
                      onClick={() => setAberto(l.professor_id)}
                    >
                      <td className="px-3 py-2.5 align-middle">
                        <p className="whitespace-nowrap text-[13px] font-medium text-ink">{l.nome}</p>
                        <p className="mt-0.5 whitespace-nowrap text-[11px] text-ink-muted">
                          {[l.grupo, l.coordenador?.split(' ')[0], l.rotulo].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <CelulaEtapas l={l} ativas={ativas} />
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex flex-wrap items-center gap-1">
                          <ChipSituacao situacao={l.situacao} />
                          {l.revisoes_pendentes > 0 && (
                            <span className="whitespace-nowrap rounded-full bg-urg-medBg px-2 py-0.5 text-[10.5px] font-medium text-urg-medFg">
                              revisar {l.revisoes_pendentes}
                            </span>
                          )}
                          {l.desbloqueios > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-muted" title="Desbloqueios de prazo">
                              <Unlock className="h-3 w-3" /> {l.desbloqueios}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-middle text-[12px]">
                        <TextoPrazo l={l} agora={agora} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-middle text-[12px]">
                        <TextoReuniao l={l} />
                      </td>
                      <td className="px-3 py-2.5 text-right align-middle">
                        <div className="flex items-center justify-end gap-1">
                          {l.situacao === 'sem_convite' && podeGerir && <BotaoConvidar l={l} />}
                          {l.situacao === 'bloqueado' && (
                            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-aviso-warnBg px-2.5 text-[11.5px] font-medium text-aviso-warnFg">
                              <Unlock className="h-3 w-3" /> Desbloquear
                            </span>
                          )}
                          {l.telefone && (
                            <a
                              href={`https://wa.me/${l.telefone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={ev => ev.stopPropagation()}
                              title="Falar no WhatsApp"
                              className="btn-press inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-subtle hover:text-ink"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <p className="text-[11.5px] text-ink-muted">
        Clique no professor para ver a linha do tempo, as etapas e as respostas, mandar o convite, desbloquear o
        prazo, dispensar ou tirar da trilha.
      </p>

      {linhaAberta && (
        <ProfessorTrilhaDialog
          linha={linhaAberta}
          etapas={ativas}
          agora={agora}
          onFechar={() => setAberto(null)}
        />
      )}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="h-10 whitespace-nowrap px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
      {children}
    </th>
  )
}

function CartaoAcao({
  icone: Icone, rotulo, valor, regra, tom, ativo, onClick,
}: {
  icone: typeof Lock
  rotulo: string
  valor: number
  /** A regra de contagem — número sem definição não serve (ktm-kpi-sempre-com-definicao). */
  regra: string
  tom?: 'alerta' | 'atencao'
  ativo: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'btn-press space-y-1 px-5 py-4 text-left transition-colors',
        ativo ? 'bg-accentBlue-soft' : 'bg-surface-canvas hover:bg-surface-subtle',
      )}
    >
      <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-muted">
        <Icone className="h-3.5 w-3.5" /> {rotulo}
      </p>
      <p className={cn(
        'text-[1.6rem] font-semibold leading-none tracking-tight tabular-nums',
        valor > 0 && tom === 'alerta' ? 'text-aviso-warnFg' : valor > 0 && tom === 'atencao' ? 'text-urg-medFg' : 'text-ink',
      )}>
        {valor}
      </p>
      <p className="text-[11.5px] leading-snug text-ink-muted">{regra}</p>
    </button>
  )
}
