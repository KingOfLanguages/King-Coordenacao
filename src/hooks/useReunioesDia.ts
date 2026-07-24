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
    score_atual: number | null
    score_faixa: string | null
  } | null
}

export type ReuniaoCard = {
  id: string
  data: string
  titulo: string | null
  meet_link: string | null
  professor_email: string | null
  status: string
  notas: string | null
  tipo_reuniao: 'professor' | 'interna' | 'grupo'
  pauta: string | null
  participantes_emails: string[]
  participantes: ParticipanteCard[]
}

/** True quando a reunião é de grupo (várias participações de professores num
 *  mesmo horário de agenda). Confia no tipo_reuniao='grupo', mas cai para a
 *  heurística de 2+ participantes enquanto a migration Fase A não roda. */
export function isReuniaoGrupo(r: ReuniaoCard): boolean {
  if (r.tipo_reuniao === 'grupo')   return true
  if (r.tipo_reuniao === 'interna') return false
  return r.participantes.length > 1
}

export type ProfVinculo = { id: string; nome: string; data_inicio: string | null }

export type CandidatoVinculo = {
  professor: { id: string; nome: string }
  confianca: number
  motivo: 'email' | 'nome'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function dayRange(date: Date) {
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

const REUNIOES_SELECT = `
  id, data, titulo, meet_link, professor_email, status, notas, tipo_reuniao, pauta, participantes_emails,
  participantes:reuniao_professores (
    id, status, numero, observacao,
    professor:professores (
      id, nome, data_inicio, grupo_id, monitoramento,
      professor_acompanhamento (score_atual, score_faixa)
    )
  )
`

// Formato cru vindo do PostgREST (professor_acompanhamento vem aninhado e pode
// ser objeto ou array de um item, dependendo da inferência da relação).
type AcompRaw = { score_atual: number | null; score_faixa: string | null }
type ProfRaw = {
  id: string; nome: string; data_inicio: string | null; grupo_id: string | null
  monitoramento: boolean
  professor_acompanhamento: AcompRaw | AcompRaw[] | null
}
type ParticipanteRaw = {
  id: string
  status: ParticipanteCard['status']
  numero: number | null
  observacao: string | null
  professor: ProfRaw | null
}
type ReuniaoRaw = {
  id: string; data: string; titulo: string | null; meet_link: string | null
  professor_email: string | null; status: string; notas: string | null
  tipo_reuniao: 'professor' | 'interna' | 'grupo'; pauta: string | null; participantes_emails: string[] | null
  participantes: ParticipanteRaw[] | null
}

function mapParticipante(p: ParticipanteRaw): ParticipanteCard {
  const prof = p.professor
  const acomp = Array.isArray(prof?.professor_acompanhamento)
    ? prof?.professor_acompanhamento[0]
    : prof?.professor_acompanhamento
  return {
    id: p.id,
    status: p.status,
    numero: p.numero,
    observacao: p.observacao,
    professor: prof
      ? {
          id: prof.id,
          nome: prof.nome,
          data_inicio: prof.data_inicio,
          grupo_id: prof.grupo_id,
          monitoramento: prof.monitoramento,
          score_atual: acomp?.score_atual ?? null,
          score_faixa: acomp?.score_faixa ?? null,
        }
      : null,
  }
}

async function fetchReunioes(coordId: string, inicio: string, fim: string): Promise<ReuniaoCard[]> {
  const { data, error } = await supabase
    .from('reunioes')
    .select(REUNIOES_SELECT)
    .eq('coordenador_id', coordId)
    .gte('data', inicio)
    .lte('data', fim)
    .order('data')
  if (error) throw error
  return ((data ?? []) as unknown as ReuniaoRaw[]).map(r => ({
    id: r.id,
    data: r.data,
    titulo: r.titulo,
    meet_link: r.meet_link,
    professor_email: r.professor_email,
    status: r.status,
    notas: r.notas,
    tipo_reuniao: r.tipo_reuniao,
    pauta: r.pauta,
    participantes_emails: r.participantes_emails ?? [],
    participantes: (r.participantes ?? []).map(mapParticipante),
  }))
}

/** Reuniões num intervalo arbitrário (visões de semana/mês da agenda). */
export function useReunioesPeriodo(coordId: string | null, inicio: Date, fim: Date) {
  const chave = `${inicio.toISOString()}_${fim.toISOString()}`
  return useQuery({
    queryKey: ['reunioes-periodo', coordId, chave],
    enabled: !!coordId,
    queryFn: () => fetchReunioes(coordId!, inicio.toISOString(), fim.toISOString()),
    staleTime: 60 * 1000,
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
      queryClient.invalidateQueries({ queryKey: ['reunioes-periodo'] })
      queryClient.invalidateQueries({ queryKey: ['dados-vinculo'] })
    },
  })
}

/** Desvincula o professor de uma participação — reseta status/numero/confirmação (pertenciam ao
 *  professor errado) e a linha volta a aparecer como "não vinculado", reabrindo sugestões + seleção manual. */
export function useDesvincularProfessor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (participanteId: string) => {
      const { error } = await supabase
        .from('reuniao_professores')
        .update({
          professor_id:   null,
          status:         'pendente',
          numero:         null,
          confirmado_em:  null,
          confirmado_por: null,
        })
        .eq('id', participanteId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reunioes-dia'] })
      queryClient.invalidateQueries({ queryKey: ['reunioes-periodo'] })
    },
  })
}

/** Edita data/hora, título e/ou pauta da reunião (nível card, não a participação de um professor específico). */
export function useEditarReuniao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data, titulo, pauta }: {
      id: string; data?: string; titulo?: string | null; pauta?: string | null
    }) => {
      const patch: Record<string, unknown> = {}
      if (data !== undefined)   patch.data = data
      if (titulo !== undefined) patch.titulo = titulo?.trim() || null
      if (pauta !== undefined)  patch.pauta = pauta?.trim() || null
      const { error } = await supabase.from('reunioes').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reunioes-dia'] })
      queryClient.invalidateQueries({ queryKey: ['reunioes-periodo'] })
    },
  })
}

/** Cria uma reunião manual na área do coordenador informado.
 *  - 'professor': vincula 1 professor. Merge — se já existir reunião com o mesmo
 *    professor no mesmo dia (mesma área), NÃO duplica: junta na existente.
 *  - 'interna': equipe/liderança, sem professor. */
export function useCriarReuniao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tipo: 'professor' | 'interna'
      coordenadorId: string
      dataISO: string
      titulo?: string | null
      meetLink?: string | null
      professorId?: string | null
      professorEmail?: string | null
      pauta?: string | null
      participantesEmails?: string[]
      observacao?: string | null
    }): Promise<{ reuniaoId: string; merged: boolean }> => {
      const { tipo, coordenadorId, dataISO } = input

      if (tipo === 'professor') {
        if (!input.professorId) throw new Error('Selecione o professor.')

        // Merge: já existe reunião desse professor nesse dia, nessa área?
        const { inicio, fim } = dayRange(new Date(dataISO))
        const { data: doDia, error: errBusca } = await supabase
          .from('reunioes')
          .select('id, participantes:reuniao_professores (professor_id)')
          .eq('coordenador_id', coordenadorId)
          .gte('data', inicio)
          .lte('data', fim)
        if (errBusca) throw errBusca
        const existente = (doDia ?? []).find(r =>
          ((r.participantes ?? []) as { professor_id: string | null }[])
            .some(p => p.professor_id === input.professorId),
        )
        if (existente) return { reuniaoId: existente.id as string, merged: true }

        const { data: nova, error: errIns } = await supabase
          .from('reunioes')
          .insert({
            data:            dataISO,
            titulo:          input.titulo?.trim() || null,
            meet_link:       input.meetLink?.trim() || null,
            professor_email: input.professorEmail?.trim() || null,
            coordenador_id:  coordenadorId,
            tipo_reuniao:    'professor',
            status:          'pendente',
          })
          .select('id')
          .single()
        if (errIns) throw errIns

        const { error: errLink } = await supabase
          .from('reuniao_professores')
          .insert({
            reuniao_id:   nova.id,
            professor_id: input.professorId,
            status:       'pendente',
            observacao:   input.observacao?.trim() || null,
          })
        if (errLink) throw errLink

        return { reuniaoId: nova.id as string, merged: false }
      }

      // interna
      const { data: nova, error: errIns } = await supabase
        .from('reunioes')
        .insert({
          data:                 dataISO,
          titulo:               input.titulo?.trim() || null,
          pauta:                input.pauta?.trim() || null,
          meet_link:            input.meetLink?.trim() || null,
          coordenador_id:       coordenadorId,
          tipo_reuniao:         'interna',
          status:               'pendente',
          participantes_emails: input.participantesEmails ?? [],
        })
        .select('id')
        .single()
      if (errIns) throw errIns
      return { reuniaoId: nova.id as string, merged: false }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reunioes-dia'] })
      queryClient.invalidateQueries({ queryKey: ['reunioes-periodo'] })
    },
  })
}

/** Confirma uma reunião interna (equipe/liderança, sem professor) como concluída ou cancelada + observação. */
export function useConfirmarReuniaoInterna() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, aconteceu, observacao }: {
      id: string; aconteceu: boolean; observacao?: string
    }) => {
      const { error } = await supabase
        .from('reunioes')
        .update({
          status: aconteceu ? 'concluida' : 'cancelada',
          notas:  observacao?.trim() || null,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reunioes-dia'] })
      queryClient.invalidateQueries({ queryKey: ['reunioes-periodo'] })
    },
  })
}

/** Perfis com e-mail conhecido — usado pra resolver nome a partir do e-mail dos
 *  participantes de uma reunião interna (participantes_emails). Considera tanto o
 *  e-mail de cadastro/login (profiles.email) quanto o alternativo (google_email). */
export function usePerfisPorEmail() {
  return useQuery({
    queryKey: ['perfis-por-email'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, nome, email, google_email')
      if (error) throw error
      const mapa = new Map<string, string>()
      for (const p of data ?? []) {
        if (p.email)        mapa.set(p.email.toLowerCase(), p.nome)
        if (p.google_email) mapa.set(p.google_email.toLowerCase(), p.nome)
      }
      return mapa
    },
    staleTime: 10 * 60 * 1000,
  })
}

/** Exclui a reunião inteira (cascata apaga os vínculos em reuniao_professores). */
export function useExcluirReuniao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reunioes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reunioes-dia'] })
      queryClient.invalidateQueries({ queryKey: ['reunioes-periodo'] })
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
      queryClient.invalidateQueries({ queryKey: ['reunioes-periodo'] })
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}

/** Confirma a presença de uma reunião de grupo de uma vez: presentes → realizada
 *  (com numeração de monitoramento), pendentes restantes → cancelada, observação
 *  comum em reunioes.notas. Usa a RPC confirmar_reuniao_grupo — a MESMA que a
 *  extensão chama, garantindo numeração consistente entre as duas superfícies. */
export function useConfirmarReuniaoGrupo() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ reuniaoId, presentesIds, observacao }: {
      reuniaoId: string
      presentesIds: string[]
      observacao?: string
    }) => {
      const { error } = await supabase.rpc('confirmar_reuniao_grupo', {
        p_reuniao_id: reuniaoId,
        p_presentes: presentesIds,
        p_observacao: observacao?.trim() || null,
        p_confirmado_por: profile?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reunioes-dia'] })
      queryClient.invalidateQueries({ queryKey: ['reunioes-periodo'] })
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}
