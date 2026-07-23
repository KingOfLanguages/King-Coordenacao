import { mensagemPendencia } from '@/lib/pendenciasMensagens'
import type { EstagioNum } from '@/hooks/usePendencias'

// ─────────────────────────────────────────────────────────────────────────────
// Régua oficial da Central de Pendências (motor no back-end King). O professor
// fica em UM estágio — o do dia atual:
//   1 = Lembrete  (2 dias sem lançar)
//   2 = Bloqueio  (3–4 dias — agenda bloqueada para novos alunos)
//   3 = Reunião   (5+ dias — risco de encerramento; só a coordenação libera)
// Ver "Guia de Integração da API (Central de Pendências)".
// ─────────────────────────────────────────────────────────────────────────────

export interface EstagioInfo {
  n: EstagioNum
  titulo: string     // rótulo do estágio / filtro
  botao: string      // rótulo do botão "marcar enviada"
  chip: string       // classes do badge de estágio
  dias: string       // classes do "dias sem lançar" (comunica gravidade)
}

export const ESTAGIO: Record<EstagioNum, EstagioInfo> = {
  1: { n: 1, titulo: 'Lembrete', botao: 'Marcar 1ª mensagem enviada', chip: 'bg-urg-medBg text-urg-medFg',   dias: 'text-urg-medFg'  },
  2: { n: 2, titulo: 'Bloqueio', botao: 'Marcar 2ª mensagem enviada', chip: 'bg-urg-highBg text-urg-highFg', dias: 'text-urg-highFg' },
  3: { n: 3, titulo: 'Reunião',  botao: 'Marcar 3ª mensagem enviada', chip: 'bg-urg-highBg text-urg-highFg', dias: 'text-urg-highFg' },
}

export const ORDEM_ESTAGIOS: EstagioNum[] = [1, 2, 3]

// Os 3 textos-padrão são IDÊNTICOS aos do guia da API — reaproveita o que já
// existe (evita divergência de conteúdo). Estágio 1/2/3 → template 1/2/3.
const ESTAGIO_TO_TEMPLATE = { 1: 'alerta', 2: 'aviso_saida', 3: 'reuniao' } as const

export function mensagemDoEstagio(estagio: EstagioNum, nome: string, aulasPendentes: number): string {
  return mensagemPendencia(ESTAGIO_TO_TEMPLATE[estagio], nome, aulasPendentes)
}

/** Rótulo de gravidade N× = aulasPendentes ÷ alunos (pode ser null). */
export function severidadeLabel(nx: number | null): string | null {
  return nx == null ? null : `${nx.toFixed(1)}×`
}

// ── Auditoria: enum `tipo` da pendência (1..4) ────────────────────────────────
export const TIPO_PENDENCIA: Record<number, string> = {
  1: 'Aula regular',
  2: 'Reposição',
  3: 'Turma',
  4: 'Reposição de turma',
}

// ── Auditoria: tipo do evento (1 bloqueio / 2 desbloqueio) ────────────────────
export function tipoEventoLabel(t: number): string {
  return t === 1 ? 'Bloqueio automático' : t === 2 ? 'Desbloqueio automático' : 'Evento'
}
