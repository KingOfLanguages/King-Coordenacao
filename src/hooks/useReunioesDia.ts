import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParticipanteCard = {
  id: string
  status: 'pendente' | 'realizada' | 'cancelada'
  numero: number | null
  observacao: string | null
  professor: {
    id: string
    nome: string
    data_inicio: string | null
    grupo_id: string | null
    monitoramento: boolean
  } | null
}

export type ReuniaoCard = {
  id: string
  data: string
  titulo: string | null
  meet_link: string | null
  professor_email: string | null
  status: string
  participantes: ParticipanteCard[]
}

export type ProfVinculo = { id: string; nome: string; data_inicio: string | null }

export type CandidatoVinculo = {
  professor: { id: string; nome: string }
  confianca: number
  motivo: 'email' | 'nome'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dayRange(date: Date) {
  const inicio = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
  const fim    = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
  return { inicio: inicio.toISOString(), fim: fim.toISOString() }
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function emailLocal(email?: string | null): string {
  if (!email) return ''
  return email.split('@')[0].replace(/[0-9._-]+/g, ' ')
}

/**
 * Sugere professores para um evento sem vínculo.
 *  1. Match exato por e-mail (em professor_emails) → 100% de confiança.
 *  2. Proximidade de nome (título + parte local do e-mail) → até 90%.
 */
export function sugerirVinculos(
  reuniao: { professor_email: string | null; titulo: string | null },
  profs: ProfVinculo[],
  emails: { professor_id: string; email: string }[],
): CandidatoVinculo[] {
  const email = reuniao.professor_email?.toLowerCase().trim()
  if (email) {
    const hit = emails.find(e => e.email.toLowerCase().trim() === email)
    if (hit) {
      const prof = profs.find(p => p.id === hit.professor_id)
      if (prof) return [{ professor: { id: prof.id, nome: prof.nome }, confianca: 100, motivo: 'email' }]
    }
  }

  const alvo = norm(`${reuniao.titulo ?? ''} ${emailLocal(email)}`)
  if (!alvo.trim()) return []

  return profs
    .map(p => {
      const tokens = norm(p.nome).split(' ').filter(t => t.length > 1 && !['de', 'da', 'do', 'dos', 'das', 'e'].includes(t))
      const hits = tokens.filter(t => alvo.includes(t)).length
      const confianca = tokens.length ? Math.round((hits / tokens.length) * 90) : 0
      return { professor: { id: p.id, nome: p.nome }, confianca, motivo: 'nome' as const }
    })
    .filter(c => c.confianca >= 40)
    .sort((a, b) => b.confianca - a.confianca)
    .slice(0, 4)
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Reuniões do dia selecionado para o coordenador, com os professores vinculados (participantes). */
export function useReunioesDoDia(coordId: string | null, dia: Date = new Date()) {
  const chaveData = dia.toISOString().slice(0, 10)
  return useQuery({
    queryKey: ['reunioes-dia', coordId, chaveData],
    enabled: !!coordId,
    queryFn: async (): Promise<ReuniaoCard[]> => {
      const { inicio, fim } = dayRange(dia)
      const { data, error } = await supabase
        .from('reunioes')
        .select(`
          id, data, titulo, meet_link, professor_email, status,
          participantes:reuniao_professores (
            id, status, numero, observacao,
            professor:professores (id, nome, data_inicio, grupo_id, monitoramento)
          )
        `)
        .eq('coordenador_id', coordId)
        .gte('data', inicio)
        .lte('data', fim)
        .order('data')
      if (error) throw error
      return (data ?? []) as unknown as ReuniaoCard[]
    },
    refetchInterval: 2 * 60 * 1000,
  })
}

/** Professores ativos + todos os e-mails conhecidos, para o matching/sugestões. */
export function useDadosVinculo() {
  return useQuery({
    queryKey: ['dados-vinculo'],
    queryFn: async () => {
      const [profsRes, emailsRes] = await Promise.all([
        supabase.from('professores').select('id, nome, data_inicio').eq('status', 'ativo').order('nome'),
        supabase.from('professor_emails').select('professor_id, email'),
      ])
      if (profsRes.error)  throw profsRes.error
      if (emailsRes.error) throw emailsRes.error
      return {
        profs:  (profsRes.data  ?? []) as ProfVinculo[],
        emails: (emailsRes.data ?? []) as { professor_id: string; email: string }[],
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Vincula um professor ao evento e, se houver um e-mail novo do Calendar, aprende-o. */
export function useVincularProfessor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ reuniaoId, participanteId, professorId, emailParaAprender }: {
      reuniaoId: string
      participanteId: string | null
      professorId: string
      emailParaAprender?: string | null
    }) => {
      if (participanteId) {
        const { error } = await supabase
          .from('reuniao_professores')
          .update({ professor_id: professorId })
          .eq('id', participanteId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('reuniao_professores')
          .insert({ reuniao_id: reuniaoId, professor_id: professorId, status: 'pendente' })
        if (error) throw error
      }

      // Aprendizado: salva o e-mail do Calendar como identificador do professor.
      if (emailParaAprender) {
        const { error } = await supabase
          .from('professor_emails')
          .insert({ professor_id: professorId, email: emailParaAprender, origem: 'calendar' })
        // Ignora conflito (e-mail já cadastrado) — qualquer outro erro propaga.
        if (error && !/duplicate|unique/i.test(error.message)) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reunioes-dia'] })
      queryClient.invalidateQueries({ queryKey: ['dados-vinculo'] })
    },
  })
}

/** Cria uma reunião manualmente, já com o professor como participante (modelo novo). */
export function useCriarReuniaoManual() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ professorId, data, titulo }: {
      professorId?: string | null
      data: string
      titulo?: string
    }) => {
      const { data: reuniao, error: e1 } = await supabase
        .from('reunioes')
        .insert({
          coordenador_id: profile!.id,
          data,
          titulo: titulo?.trim() || null,
          status: 'pendente',
        })
        .select('id')
        .single()
      if (e1) throw e1

      if (professorId) {
        const { error: e2 } = await supabase
          .from('reuniao_professores')
          .insert({ reuniao_id: reuniao.id, professor_id: professorId, status: 'pendente' })
        if (e2) throw e2
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reunioes-dia'] })
    },
  })
}

/** Confirma a participação (realizada/cancelada), com numeração automática do monitoramento. */
export function useConfirmarParticipacao() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ participanteId, professorId, aconteceu, observacao }: {
      participanteId: string
      professorId: string | null
      aconteceu: boolean
      observacao?: string
    }) => {
      let numero: number | null = null
      if (aconteceu && professorId) {
        const { count } = await supabase
          .from('reuniao_professores')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId)
          .eq('status', 'realizada')
        numero = (count ?? 0) + 1
      }

      const { error } = await supabase
        .from('reuniao_professores')
        .update({
          status:         aconteceu ? 'realizada' : 'cancelada',
          observacao:     observacao?.trim() || null,
          numero,
          confirmado_em:  new Date().toISOString(),
          confirmado_por: profile?.id ?? null,
        })
        .eq('id', participanteId)
      if (error) throw error

      // Atualiza a data da última reunião do professor.
      if (aconteceu && professorId) {
        await supabase
          .from('professores')
          .update({ data_ultima_reuniao: new Date().toISOString() })
          .eq('id', professorId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reunioes-dia'] })
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}
