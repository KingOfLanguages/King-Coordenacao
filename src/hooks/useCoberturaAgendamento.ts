import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// Cobertura de agendamento (migration 20260814).
//
// "Enquanto eu estiver de férias, quem atende meu grupo é o X." No período, o
// Portal de Agendamento (/agendar) e a tela de conclusão do Welcome Path usam
// os links do substituto. Nada mais muda: o professor continua no mesmo grupo,
// e KPIs, pendências e telas internas seguem com a coordenação titular.
//
// Leitura vem da view `coberturas_agendamento` (nomes resolvidos + estado
// calculado) e a escrita vai direto na tabela, onde a RLS garante que só o
// próprio coordenador ausente, admin ou liderança consegue mexer.
// ─────────────────────────────────────────────────────────────────────────────

export type CoberturaAgendamento = {
  id: string
  coordenador_ausente_id: string
  coordenador_ausente_nome: string | null
  substituto_id: string
  substituto_nome: string | null
  /** YYYY-MM-DD */
  inicio: string
  /** YYYY-MM-DD, último dia inclusive. */
  fim: string
  motivo: string | null
  criado_por: string | null
  created_at: string
  encerrada_em: string | null
  /** Valendo hoje — é esta que o portal enxerga. */
  vigente: boolean
  /** Ainda não começou. */
  agendada: boolean
  /** Nomes dos grupos cujo coordenador é o ausente, pra deixar claro quem é afetado. */
  grupos_cobertos: string | null
}

export type CoordenadorAgendamento = {
  id: string
  nome: string
  tem_link_primeira: boolean
  tem_link_acompanhamento: boolean
}

const CHAVE = ['coberturas-agendamento']

/** Todas as coberturas, da mais recente pra mais antiga. A view já é legível por
 *  qualquer autenticado — saber quem cobre quem é escala do time. */
export function useCoberturas() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: async (): Promise<CoberturaAgendamento[]> => {
      const { data, error } = await supabase
        .from('coberturas_agendamento')
        .select('*')
        .order('inicio', { ascending: false })
      if (error) throw error
      return (data ?? []) as CoberturaAgendamento[]
    },
  })
}

/** Coordenadores ativos que podem cobrir, com os dois booleanos de link
 *  cadastrado (a view nunca expõe os links em si). */
export function useCoordenadoresAgendamento() {
  return useQuery({
    queryKey: ['coordenadores-agendamento'],
    queryFn: async (): Promise<CoordenadorAgendamento[]> => {
      const { data, error } = await supabase
        .from('coordenadores_agendamento')
        .select('id, nome, tem_link_primeira, tem_link_acompanhamento')
        .order('nome')
      if (error) throw error
      return (data ?? []) as CoordenadorAgendamento[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export type NovaCobertura = {
  coordenadorAusenteId: string
  /** Um ou mais coordenadores atendendo o mesmo período — desde a 20260816. A
   *  coordenação é em três, então quando um viaja os outros dois dividem o
   *  grupo dele e o professor marca na agenda de quem tiver horário. */
  substitutoIds: string[]
  inicio: string
  fim: string
  motivo?: string | null
}

export function useCriarCobertura() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (input: NovaCobertura) => {
      const ids = [...new Set(input.substitutoIds)].filter(Boolean)
      if (ids.length === 0) {
        throw new Error('Escolha pelo menos um coordenador para atender no período.')
      }
      // Uma linha por par (ausente, substituto). Insert único de propósito: se o
      // trigger recusar qualquer uma delas, nenhuma entra — melhor erro na cara
      // do que meia cobertura ativa, com um grupo achando que está coberto.
      const { error } = await supabase.from('coordenacao_coberturas').insert(
        ids.map(substitutoId => ({
          coordenador_ausente_id: input.coordenadorAusenteId,
          substituto_id:          substitutoId,
          inicio:                 input.inicio,
          fim:                    input.fim,
          motivo:                 input.motivo?.trim() || null,
          criado_por:             profile?.id ?? null,
        })),
      )
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: CHAVE }) },
  })
}

/** Encerra (voltou mais cedo) ou cancela (nem começou) — nos dois casos a linha
 *  fica no histórico com `encerrada_em` preenchido e deixa de valer na hora.
 *
 *  Aceita uma linha ou várias: com mais de um coordenador cobrindo a mesma
 *  ausência (20260816), "Encerrar todas" manda os ids do grupo de uma vez, e o
 *  ✕ de um nome manda só o dele.
 *
 *  `.select()` é obrigatório: sem ele, um UPDATE barrado pela RLS volta sem erro
 *  nenhum e a tela mostraria "encerrada" sem nada ter mudado. */
export function useEncerrarCobertura() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (ids: string | string[]) => {
      const lista = (Array.isArray(ids) ? ids : [ids]).filter(Boolean)
      if (lista.length === 0) return
      const { data, error } = await supabase
        .from('coordenacao_coberturas')
        .update({ encerrada_em: new Date().toISOString(), encerrada_por: profile?.id ?? null })
        .in('id', lista)
        .select('id')
      if (error) throw error
      if (!data?.length) {
        throw new Error('Nada foi alterado — você só pode encerrar a cobertura da sua própria coordenação.')
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: CHAVE }) },
  })
}
