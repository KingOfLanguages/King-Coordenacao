import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TransferenciaAluno } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Pedidos de transferência de aluno (20260761+). O formulário público e a fila
// do Suporte ao Aluno saíram em 2026-10-14 — a transferência passou para a
// plataforma da King. Os pedidos ficam no banco e a ficha do professor segue
// mostrando o histórico.
// ─────────────────────────────────────────────────────────────────────────────

type TransferenciaComProfessor = TransferenciaAluno & {
  professor?: {
    id: string
    nome: string
    status: string
    telefone: string | null
    email: string | null
    grupo?: { id: string; nome: string } | null
    coordenador?: { id: string; nome: string } | null
  } | null
  assumido_por_perfil?: { id: string; nome: string } | null
  destino?: { id: string; nome: string } | null
}

/** Dias inteiros desde um timestamp. Compara só a parte de data, sem hora —
 *  evita o resultado mudar conforme a hora em que a tela é aberta. */
export function diasDesde(ts: string): number {
  const d = new Date(ts)
  const criado = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const agora = new Date()
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return Math.round((hoje - criado) / 86_400_000)
}

const SELECT_TRANSFERENCIA = `
  *,
  professor:professores!professor_id (
    id, nome, status, telefone, email,
    grupo:grupos!grupo_id (id, nome),
    coordenador:profiles!coordenador_id (id, nome)
  ),
  assumido_por_perfil:profiles!assumido_por (id, nome),
  destino:professores!destino_professor_id (id, nome)
`

/** Pedidos de um professor — alimenta a seção no perfil dele. */
export function useTransferenciasDoProfessor(professorId?: string) {
  return useQuery({
    queryKey: ['transferencias', 'professor', professorId],
    enabled: !!professorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transferencias_aluno')
        .select(SELECT_TRANSFERENCIA)
        .eq('professor_id', professorId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as TransferenciaComProfessor[]
    },
  })
}
