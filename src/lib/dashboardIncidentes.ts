// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Geral — agregações de incidentes & informes
//
// Funções puras sobre a lista já carregada por useIncidentes() (mesmo fetch/cache
// da tela de Incidentes). O eixo "incidente × informe" é a `natureza`: desafio
// (entra na fila, é resolvido) vs informe (só registro). O recorte por coordenação
// cruza professor_id → grupo_id com o mapa que o Dashboard Geral já tem.
// ─────────────────────────────────────────────────────────────────────────────

import { natureza, type Incidente } from '@/hooks/useIncidentes'
import { bucketPeriodo, type Granularidade } from '@/hooks/useDashboardGeral'

const DIA_MS = 86_400_000

/**
 * Recorte de incidentes por coordenação + intervalo de datas (created_at).
 *  - grupoId null   → todas as coordenações (inclui incidentes sem professor).
 *  - grupoId setado → só incidentes cujo professor pertence ao grupo. Incidentes
 *    sem professor (gerais/plataforma) e de professor sem grupo conhecido saem.
 *  - dataInicial/dataFinal ('YYYY-MM-DD' ou '') limitam por dia de criação.
 */
export function recortarIncidentes(
  incidentes: Incidente[],
  grupoId: string | null,
  professorGrupo: Map<string, string | null>,
  dataInicial: string,
  dataFinal: string,
): Incidente[] {
  return incidentes.filter(i => {
    if (grupoId !== null) {
      if (!i.professor_id) return false
      if (professorGrupo.get(i.professor_id) !== grupoId) return false
    }
    const dia = i.created_at.slice(0, 10)
    if (dataInicial && dia < dataInicial) return false
    if (dataFinal && dia > dataFinal) return false
    return true
  })
}

/** True se `iso` cai dentro dos últimos `dias` (janela móvel até agora). */
export function dentroDosUltimosDias(iso: string, dias: number): boolean {
  const t = new Date(iso).getTime()
  const agora = Date.now()
  return t <= agora && agora - t <= dias * DIA_MS
}

// ─── Contador incidentes × informes ──────────────────────────────────────────

export interface ContadorNatureza {
  total: number
  desafios: number   // natureza = desafio (o "incidente" que segue o fluxo)
  informes: number   // natureza = informe (só registro)
}

export function contarPorNatureza(incidentes: Incidente[]): ContadorNatureza {
  let desafios = 0, informes = 0
  for (const i of incidentes) {
    if (natureza(i) === 'informe') informes++
    else desafios++
  }
  return { total: desafios + informes, desafios, informes }
}

// ─── Top professores mais citados ────────────────────────────────────────────

export interface ProfessorCitacoes {
  professor_id: string
  nome: string
  total: number
  desafios: number
  informes: number
}

/** Ranking de professores por nº de registros vinculados (ignora incidentes sem professor). */
export function topProfessores(incidentes: Incidente[], limite = 8): ProfessorCitacoes[] {
  const mapa = new Map<string, ProfessorCitacoes>()
  for (const i of incidentes) {
    if (!i.professor_id) continue
    let e = mapa.get(i.professor_id)
    if (!e) {
      e = { professor_id: i.professor_id, nome: i.teacher_name, total: 0, desafios: 0, informes: 0 }
      mapa.set(i.professor_id, e)
    }
    e.total++
    if (natureza(i) === 'informe') e.informes++
    else e.desafios++
  }
  return [...mapa.values()]
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome))
    .slice(0, limite)
}

// ─── Distribuição por tipo (problem_type) ────────────────────────────────────

export interface TipoContagem {
  tipo: string
  incidentes: number   // desafios
  informes: number
  total: number
}

export function porTipo(incidentes: Incidente[]): TipoContagem[] {
  const mapa = new Map<string, TipoContagem>()
  for (const i of incidentes) {
    let e = mapa.get(i.problem_type)
    if (!e) { e = { tipo: i.problem_type, incidentes: 0, informes: 0, total: 0 }; mapa.set(i.problem_type, e) }
    e.total++
    if (natureza(i) === 'informe') e.informes++
    else e.incidentes++
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || a.tipo.localeCompare(b.tipo))
}

// ─── Série temporal (por período) ────────────────────────────────────────────

export interface PontoTemporal {
  periodo: string
  ordem: number
  incidentes: number   // desafios
  informes: number
}

/** Registros agrupados por período (semana/mês/trimestre/ano), ordenados no tempo. */
export function porPeriodo(incidentes: Incidente[], gran: Granularidade): PontoTemporal[] {
  const mapa = new Map<string, PontoTemporal>()
  for (const i of incidentes) {
    const { key, label, ordem } = bucketPeriodo(i.created_at.slice(0, 10), gran)
    let p = mapa.get(key)
    if (!p) { p = { periodo: label, ordem, incidentes: 0, informes: 0 }; mapa.set(key, p) }
    if (natureza(i) === 'informe') p.informes++
    else p.incidentes++
  }
  return [...mapa.values()].sort((a, b) => a.ordem - b.ordem)
}
