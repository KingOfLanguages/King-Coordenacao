import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Como o professor entrou na lista do dia (ver migration 20260743). */
export type OrigemContato = 'normal' | 'pendencia_prioridade' | 'pendencia_extra'

export type ContatoDia = {
  id: string
  professor_id: string
  enviado: boolean
  enviado_em: string | null
  origem: OrigemContato
  estagio: 1 | 2 | 3 | null       // estágio da Central de Pendências (null = linha normal)
  dias_bloqueio: number | null    // dias com agenda bloqueada (só linhas de pendência)
  aulas_pendentes: number | null  // aulas pendentes de lançamento (só linhas de pendência)
  professor: {
    id: string
    nome: string
    email: string | null
    coordenador_id: string | null
    grupo: { coordenador_id: string | null } | { coordenador_id: string | null }[] | null
    professor_acompanhamento: { reuniao_ultima: string | null } | { reuniao_ultima: string | null }[] | null
  } | null
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

export function reuniaoUltimaDe(c: ContatoDia): string | null {
  return um(c.professor?.professor_acompanhamento)?.reuniao_ultima ?? null
}

/**
 * Coordenador que assina a mensagem: o do **grupo de coordenação** do professor.
 *
 * `grupos.coordenador_id` é a fonte de verdade — `professores.coordenador_id` é
 * denormalizado e pode ficar defasado (a `distribuir_professores_inicial` só
 * preenche com COALESCE, preservando o valor antigo quando o professor troca de
 * grupo, e o coordenador de um grupo pode ser trocado em Configurações sem tocar
 * nos professores). Cai pro campo do professor se o grupo não tiver coordenador.
 */
export function coordenadorResponsavelDe(c: ContatoDia): string | null {
  return um(c.professor?.grupo)?.coordenador_id ?? c.professor?.coordenador_id ?? null
}

/**
 * Lista diária (até 20) de professores a contatar pelo coordenador.
 * Gera a lista via RPC (idempotente — 1x por dia) e depois lê os registros de hoje.
 */
export function useContatosHoje(coordenadorId: string | null) {
  return useQuery({
    queryKey: ['contatos-dia', coordenadorId],
    enabled: !!coordenadorId,
    queryFn: async (): Promise<ContatoDia[]> => {
      const { error: rpcErr } = await supabase.rpc('gerar_contatos_dia', {
        p_coordenador_id: coordenadorId,
      })
      if (rpcErr) throw rpcErr

      const { data, error } = await supabase
        .from('contatos_diarios')
        .select(`
          id, professor_id, enviado, enviado_em,
          origem, estagio, dias_bloqueio, aulas_pendentes,
          professor:professores(
            id, nome, email, coordenador_id,
            grupo:grupos(coordenador_id),
            professor_acompanhamento(reuniao_ultima)
          )
        `)
        .eq('coordenador_id', coordenadorId)
        .eq('data', hojeISO())
      if (error) throw error

      // Não enviados primeiro; entre eles, pendências no topo (extra > prioridade
      // > normal) e as mais bloqueadas antes; por fim, ordem alfabética.
      const peso: Record<OrigemContato, number> = {
        pendencia_extra: 0, pendencia_prioridade: 1, normal: 2,
      }
      const lista = (data ?? []) as unknown as ContatoDia[]
      return lista.sort((a, b) => {
        if (a.enviado !== b.enviado) return a.enviado ? 1 : -1
        if (peso[a.origem] !== peso[b.origem]) return peso[a.origem] - peso[b.origem]
        if ((b.dias_bloqueio ?? -1) !== (a.dias_bloqueio ?? -1)) return (b.dias_bloqueio ?? -1) - (a.dias_bloqueio ?? -1)
        return (a.professor?.nome ?? '').localeCompare(b.professor?.nome ?? '')
      })
    },
  })
}

export function useMarcarContato() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, enviado }: { id: string; enviado: boolean }) => {
      const { error } = await supabase
        .from('contatos_diarios')
        .update({ enviado, enviado_em: enviado ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contatos-dia'] })
    },
  })
}
