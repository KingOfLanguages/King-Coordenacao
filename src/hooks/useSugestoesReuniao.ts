import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  calcularPrioridade, nivelPrioridade, type NivelPrioridade,
} from '@/lib/prioridade'

// ─────────────────────────────────────────────────────────────────────────────
// Quem chamar para fechar o dia.
//
// Quando a agenda do coordenador está abaixo da meta do dia, esta consulta
// devolve os professores DELE em ordem de quem mais precisa de reunião, para o
// bloco de sugestões em /reunioes. É uma pergunta diferente da de /emails
// (lá a coordenação filtra e dispara em massa): aqui são poucos nomes, com
// telefone e e-mail à mão, para resolver o buraco de hoje.
//
// UMA query de professores, de propósito: o painel de Acompanhamento já mostrou
// que um Promise.all de várias consultas zera a tela inteira quando uma coluna
// some do schema (ver ktm-painel-professores-fragil-schema). As outras duas
// consultas são independentes e cada uma degrada sozinha.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dias sem reunião a partir dos quais o professor volta a ser sugerido.
 *
 * 30 e não 7 (2026-08-21): a régua da coordenação é UM acompanhamento oficial
 * por mês até o 3º mês, então quem teve reunião dentro do mês está em dia e
 * chamá-lo de novo é cobrar duas vezes a mesma coisa. Mesmo número da cadência
 * do portal (CADENCIA_MIN_DIAS em portal-agendamento-lookup) — as duas telas
 * não podem discordar sobre quem está em dia.
 */
const CARENCIA_DIAS = 30

/** Janela à frente de "já tem reunião marcada" — reuniões futuras dentro dela
 *  tiram o professor da lista, porque o contato já foi feito. Reunião de dúvida
 *  não conta: ela não substitui o acompanhamento. */
const JANELA_AGENDADAS_DIAS = 30

export interface SugestaoContato {
  professor_id: string
  nome: string
  email: string | null
  telefone: string | null
  grupo_nome: string | null
  coordenador_nome: string | null

  data_ultima_reuniao: string | null
  /** null = nunca teve reunião registrada. */
  dias_sem_reuniao: number | null
  score_atual: number | null
  aulas_pendentes_qtd: number
  elegivel_alocacao: boolean | null

  prioridade: number
  nivel: NivelPrioridade
  /** Por que este nome está na lista — o que o coordenador lê antes de chamar. */
  sinais: string[]
}

const SELECT_PROFESSOR = `
  id, nome, email, telefone, data_ultima_reuniao, coordenador_id, grupo_id,
  grupo:grupos!grupo_id (id, nome),
  coordenador:profiles!coordenador_id (nome),
  professor_acompanhamento (
    score_atual, elegivel_alocacao, reuniao_ultima,
    aulas_pendentes_qtd, aulas_pendentes_data_mais_antiga
  )
`

type AcompRaw = {
  score_atual: number | null
  elegivel_alocacao: boolean | null
  reuniao_ultima: string | null
  aulas_pendentes_qtd: number | null
  aulas_pendentes_data_mais_antiga: string | null
}

type ProfessorRaw = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  data_ultima_reuniao: string | null
  grupo: { id: string; nome: string } | { id: string; nome: string }[] | null
  coordenador: { nome: string } | { nome: string }[] | null
  professor_acompanhamento: AcompRaw | AcompRaw[] | null
}

function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

/** Dias corridos desde uma data/timestamp ISO. null quando ausente ou inválida. */
function diasDesdeISO(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

function tempoSemReuniaoLabel(dias: number | null): string {
  if (dias == null) return 'nunca teve reunião'
  if (dias >= 60) return `${Math.floor(dias / 30)} meses sem reunião`
  return `${dias} dias sem reunião`
}

/** Os sinais que justificam o nome na lista, do mais forte ao mais fraco. */
function sinaisDe(s: Omit<SugestaoContato, 'sinais'>): string[] {
  const out = [tempoSemReuniaoLabel(s.dias_sem_reuniao)]
  if (s.aulas_pendentes_qtd > 0) {
    out.push(`${s.aulas_pendentes_qtd} aula${s.aulas_pendentes_qtd > 1 ? 's' : ''} pendente${s.aulas_pendentes_qtd > 1 ? 's' : ''}`)
  }
  if (s.elegivel_alocacao === false) out.push('bloqueado para novos alunos')
  if (s.score_atual != null && s.score_atual < 1000) out.push(`score ${s.score_atual}`)
  return out
}

/**
 * Professores do coordenador em ordem de "quem mais precisa de reunião".
 *
 * Já saem de fora: quem teve reunião nos últimos CARENCIA_DIAS e quem já tem
 * reunião marcada nos próximos JANELA_AGENDADAS_DIAS. A exclusão das reuniões
 * de HOJE fica com quem chama (a tela já tem a lista do dia em mãos).
 */
export function useSugestoesReuniao(coordenadorId: string | null) {
  return useQuery({
    queryKey: ['sugestoes-reuniao', coordenadorId],
    enabled: !!coordenadorId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SugestaoContato[]> => {
      const coordId = coordenadorId!

      const agora = new Date()
      const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
      const fimJanela = new Date(inicioHoje)
      fimJanela.setDate(fimJanela.getDate() + JANELA_AGENDADAS_DIAS)

      // Grupos coordenados por ele: `grupos.coordenador_id` é a fonte de verdade
      // (professores.coordenador_id é denormalizado e envelhece — mesma ressalva
      // de coordenadorResponsavelDe em useContatosDia). Os dois entram na busca.
      const [gruposRes, agendadasRes] = await Promise.all([
        supabase.from('grupos').select('id').eq('coordenador_id', coordId),
        supabase
          .from('reunioes')
          .select('id, natureza, reuniao_professores (professor_id)')
          .eq('coordenador_id', coordId)
          .gte('data', inicioHoje.toISOString())
          .lte('data', fimJanela.toISOString()),
      ])
      if (gruposRes.error) throw gruposRes.error
      if (agendadasRes.error) throw agendadasRes.error

      const gruposIds = (gruposRes.data ?? []).map(g => g.id as string)

      type ReuniaoAgendada = {
        natureza?: string | null
        reuniao_professores: { professor_id: string }[] | null
      }
      const jaMarcados = new Set<string>()
      for (const r of (agendadasRes.data ?? []) as ReuniaoAgendada[]) {
        // `natureza` pode vir indefinida enquanto a 20260770 não estiver
        // aplicada — nesse caso tudo é acompanhamento, como era antes.
        if ((r.natureza ?? 'acompanhamento') === 'duvida') continue
        for (const p of r.reuniao_professores ?? []) jaMarcados.add(p.professor_id)
      }

      const base = supabase.from('professores').select(SELECT_PROFESSOR).eq('status', 'ativo')
      const query = gruposIds.length > 0
        ? base.or(`grupo_id.in.(${gruposIds.join(',')}),coordenador_id.eq.${coordId}`)
        : base.eq('coordenador_id', coordId)

      const { data, error } = await query.order('nome')
      if (error) throw error

      const lista: SugestaoContato[] = []
      for (const p of (data ?? []) as unknown as ProfessorRaw[]) {
        if (jaMarcados.has(p.id)) continue

        const acomp = um(p.professor_acompanhamento)
        const dias = diasDesdeISO(p.data_ultima_reuniao ?? acomp?.reuniao_ultima)
        if (dias != null && dias < CARENCIA_DIAS) continue

        const pendentes = acomp?.aulas_pendentes_qtd ?? 0
        const diasPendencia = pendentes > 0
          ? (diasDesdeISO(acomp?.aulas_pendentes_data_mais_antiga) ?? 0)
          : 0
        const prioridade = calcularPrioridade(acomp?.score_atual, pendentes, diasPendencia)

        const parcial = {
          professor_id: p.id,
          nome: p.nome,
          email: p.email,
          telefone: p.telefone,
          grupo_nome: um(p.grupo)?.nome ?? null,
          coordenador_nome: um(p.coordenador)?.nome ?? null,
          data_ultima_reuniao: p.data_ultima_reuniao ?? acomp?.reuniao_ultima ?? null,
          dias_sem_reuniao: dias,
          score_atual: acomp?.score_atual ?? null,
          aulas_pendentes_qtd: pendentes,
          elegivel_alocacao: acomp?.elegivel_alocacao ?? null,
          prioridade,
          nivel: nivelPrioridade(prioridade),
        }
        lista.push({ ...parcial, sinais: sinaisDe(parcial) })
      }

      // Índice de Prioridade primeiro (score baixo / pendência acumulada é o caso
      // mais grave); empatado — que é o normal para quem está em dia — decide
      // quem está há mais tempo sem reunião, com "nunca teve" na frente de todos.
      return lista.sort((a, b) => {
        if (b.prioridade !== a.prioridade) return b.prioridade - a.prioridade
        const da = a.dias_sem_reuniao ?? Number.POSITIVE_INFINITY
        const db = b.dias_sem_reuniao ?? Number.POSITIVE_INFINITY
        if (db !== da) return db - da
        return a.nome.localeCompare(b.nome)
      })
    },
  })
}
