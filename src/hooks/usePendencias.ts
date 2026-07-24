import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Pendências — cliente da API oficial do King (/api/PendenciaLancamento),
// via Edge Function `pendencias-lancamento` (proxy autenticado que loga na API
// King com a conta compartilhada — a chave nunca chega ao browser).
//
// O motor (detecção, régua dia 2/3/5, bloqueio de agenda, auditoria) roda no
// back-end King. Aqui é só leitura + duas ações (RegistrarMensagem/LiberarAgenda).
// Os dados mudam ~1×/dia (o motor roda de madrugada) — um botão "Atualizar" basta.
// ─────────────────────────────────────────────────────────────────────────────

export type EstagioNum = 1 | 2 | 3

/** supabase-js só expõe `error.message` genérico em erro HTTP da function — o
 *  corpo real ({error:"..."}) vem em error.context (a Response). Mesma armadilha
 *  já documentada em useMesAnalise.ts; extrai a mensagem antes de lançar. */
async function invocarPendencias<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('pendencias-lancamento', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    let mensagem: string | null = null
    if (ctx) {
      try {
        const parsed = await ctx.clone().json()
        if (parsed?.error) mensagem = parsed.error
      } catch { /* corpo não era JSON */ }
    }
    throw new Error(mensagem ?? error.message)
  }
  if (data?.error) throw new Error(data.error)
  return (data?.object ?? null) as T
}

// ── Fila (board) ──────────────────────────────────────────────────────────────

/** Item cru da API `/Fila` (camelCase, enums numéricos — ver o guia). */
export interface PendenciaApi {
  id_Professor: number
  nome: string
  email: string | null
  qtdAlunos: number | null
  aulasPendentes: number
  dias: number
  diasPico: number
  severidadeNx: number | null
  estagio: EstagioNum
  agendaBloqueada: boolean
  liberacaoManualExigida: boolean
  regularizado: boolean
  abertoEm: string
  ultimaMensagemEm: string | null
  ultimaMensagemEstagio: EstagioNum | null
}

/** Fila enriquecida com dados locais: grupo/coordenador (p/ filtro) e o uuid do
 *  professor no KTM (p/ link da página dele). id_Professor == professores.kms_id. */
export interface PendenciaFila extends PendenciaApi {
  professor_uuid: string | null
  professor_status: string | null
  professor_telefone: string | null
  grupo_id: string | null
  grupo_nome: string | null
  coordenador_nome: string | null
}

interface ProfLocalRow {
  id: string
  kms_id: string
  status: string | null
  telefone: string | null
  grupo: { id: string; nome: string } | { id: string; nome: string }[] | null
  coordenador: { nome: string | null } | { nome: string | null }[] | null
}

const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

export function usePendenciasFila() {
  return useQuery({
    queryKey: ['pendencias-fila'],
    queryFn: async (): Promise<PendenciaFila[]> => {
      const lista = (await invocarPendencias<PendenciaApi[]>({ resource: 'fila' })) ?? []
      if (lista.length === 0) return []

      // Junta grupo/coordenador/uuid por kms_id (== id_Professor). A fila é
      // pequena (só casos ativos), então um único `in(...)` resolve tudo.
      const kmsIds = lista.map(p => String(p.id_Professor))
      const { data: profs, error } = await supabase
        .from('professores')
        .select('id, kms_id, status, telefone, grupo:grupos!grupo_id (id, nome), coordenador:profiles!coordenador_id (nome)')
        .in('kms_id', kmsIds)
      if (error) throw error

      const porKms = new Map<string, Pick<PendenciaFila,
        'professor_uuid' | 'professor_status' | 'professor_telefone' | 'grupo_id' | 'grupo_nome' | 'coordenador_nome'>>()
      for (const raw of (profs ?? []) as ProfLocalRow[]) {
        const grupo = um(raw.grupo)
        const coord = um(raw.coordenador)
        porKms.set(String(raw.kms_id), {
          professor_uuid: raw.id,
          professor_status: raw.status,
          professor_telefone: raw.telefone,
          grupo_id: grupo?.id ?? null,
          grupo_nome: grupo?.nome ?? null,
          coordenador_nome: coord?.nome ?? null,
        })
      }

      return lista.map((p): PendenciaFila => ({
        ...p,
        ...(porKms.get(String(p.id_Professor)) ?? {
          professor_uuid: null, professor_status: null, professor_telefone: null,
          grupo_id: null, grupo_nome: null, coordenador_nome: null,
        }),
      }))
    },
  })
}

// ── Ações ─────────────────────────────────────────────────────────────────────

export function useRegistrarMensagem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id_Professor: number; estagio: EstagioNum; texto: string }) =>
      invocarPendencias({ resource: 'registrarMensagem', ...v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pendencias-fila'] })
      qc.invalidateQueries({ queryKey: ['pendencias-professor'] })
    },
  })
}

export function useLiberarAgenda() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id_Professor: number }) =>
      invocarPendencias({ resource: 'liberarAgenda', ...v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pendencias-fila'] })
      qc.invalidateQueries({ queryKey: ['pendencias-professor'] })
    },
  })
}

// ── Detalhe do professor (carregado sob demanda no drawer) ────────────────────

export interface PendenciaLog {
  estagio: EstagioNum
  texto: string
  enviadoPorNome: string | null
  enviadoEm: string
}

export interface PendenciaSnapshot {
  semana: string
  qtdPendencias: number
  diasMax: number | null
}

export interface PendenciaHistorico {
  abertoEm: string
  resolvidoEm: string
  diasPico: number
  aulasPendentesPico: number | null
  estagioFinal: EstagioNum
}

export interface AuditoriaPendencia {
  id_Aluno: number
  turma_Id: number | null
  data_Pendencia: string
  tipo: number
}

export interface PendenciaAuditoria {
  tipoEvento: number
  estagio: EstagioNum
  diasPendente: number
  aulasPendentes: number
  dataMaisAntiga: string | null
  ocorridoEm: string
  pendencias: AuditoriaPendencia[]
}

export function usePendenciaLogs(idProfessor?: number) {
  return useQuery({
    queryKey: ['pendencias-professor', 'logs', idProfessor],
    enabled: !!idProfessor,
    queryFn: async () =>
      (await invocarPendencias<PendenciaLog[]>({ resource: 'logs', professorId: idProfessor })) ?? [],
  })
}

export function usePendenciaSnapshots(idProfessor?: number) {
  return useQuery({
    queryKey: ['pendencias-professor', 'snapshots', idProfessor],
    enabled: !!idProfessor,
    queryFn: async () =>
      (await invocarPendencias<PendenciaSnapshot[]>({ resource: 'snapshots', professorId: idProfessor })) ?? [],
  })
}

export function usePendenciaHistorico(idProfessor?: number) {
  return useQuery({
    queryKey: ['pendencias-professor', 'historico', idProfessor],
    enabled: !!idProfessor,
    queryFn: async () =>
      (await invocarPendencias<PendenciaHistorico[]>({ resource: 'historico', professorId: idProfessor })) ?? [],
  })
}

/** Auditoria forense é carregada só quando o usuário pede (enabled). */
export function usePendenciaAuditoria(idProfessor?: number, enabled = false) {
  return useQuery({
    queryKey: ['pendencias-professor', 'auditoria', idProfessor],
    enabled: !!idProfessor && enabled,
    queryFn: async () =>
      (await invocarPendencias<PendenciaAuditoria[]>({ resource: 'auditoria', professorId: idProfessor })) ?? [],
  })
}
