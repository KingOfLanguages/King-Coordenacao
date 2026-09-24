// ─────────────────────────────────────────────────────────────────────────────
// Presença automática — confirma a reunião 1:1 sozinha depois que o professor
// fica alguns minutos na chamada.
//
// Por que só 1:1: em grupo, um nome lido errado marcaria presença de quem nem
// entrou; lá a lista já abre marcada e o coordenador confirma.
//
// A contagem é por participação (reuniao_professores.id) e fica no
// sessionStorage da aba — sobrevive a um F5 no meio da chamada, morre com a aba.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { confiancaMatch } from '../shared/match'
import { extrairCandidatos } from './scrape'
import type { MotivoIdentificacao, ProfessorEncontrado } from '../shared/types'

/** Tempo contínuo do professor na chamada até a reunião contar como realizada. */
export const TEMPO_PRESENCA_MS = 3 * 60_000
/** Sumiço tolerado sem zerar a contagem: a lista do Meet se redesenha e conexões caem. */
export const TOLERANCIA_AUSENCIA_MS = 30_000
/** Sem ler participante nenhum por este tempo, o painel avisa que não está enxergando a chamada. */
export const SEM_LEITURA_MS = 60_000
const PASSO_MS = 5_000
/** Similaridade mínima entre um nome da chamada e o do cadastro (a régua do selo azul). */
const MIN_NOME = 0.6
/** Reconhecido só pelo nome, confirma sozinho apenas com confiança alta (a do selo verde). */
const MIN_CONFIANCA_NOME = 0.8

export interface Contagem {
  /** Início do trecho contínuo de presença (ms). */
  desde: number | null
  /** Última vez que o professor foi visto (ms). */
  vistoEm: number | null
}

export const CONTAGEM_ZERO: Contagem = { desde: null, vistoEm: null }

export function avancarContagem(c: Contagem, visto: boolean, agora: number): Contagem {
  const sumiuDemais = c.vistoEm != null && agora - c.vistoEm > TOLERANCIA_AUSENCIA_MS
  if (!visto) return sumiuDemais ? CONTAGEM_ZERO : c
  if (c.desde == null || sumiuDemais) return { desde: agora, vistoEm: agora }
  return { desde: c.desde, vistoEm: agora }
}

/** Conta até a última vez que ele foi visto — o sumiço tolerado não vira presença. */
export function tempoPresente(c: Contagem): number {
  return c.desde != null && c.vistoEm != null ? c.vistoEm - c.desde : 0
}

/** Pode confirmar sem clique? Reunião 1:1 pendente e professor reconhecido com segurança. */
export function podeConfirmarSozinho(r: ProfessorEncontrado | null): boolean {
  const reuniao = r?.reuniaoHoje
  if (!r || !reuniao || reuniao.status !== 'pendente' || reuniao.tipo_reuniao === 'grupo') return false
  if (r.motivo === 'agenda' || r.motivo === 'email') return true
  return (r.confianca ?? 0) >= MIN_CONFIANCA_NOME
}

/** O professor está entre os participantes lidos agora? */
export function professorNaChamada(nomes: string[], nomeProfessor: string, motivo: MotivoIdentificacao): boolean {
  if (nomes.length && confiancaMatch(nomes, nomeProfessor) >= MIN_NOME) return true
  // 1:1 da agenda nesta mesma sala: a única outra pessoa é o professor, mesmo que
  // a conta Google dele exiba outro nome.
  return motivo === 'agenda' && nomes.length === 1
}

export type EstadoPresenca =
  | { fase: 'inativa' }
  | { fase: 'aguardando' }
  | { fase: 'contando'; segundos: number }
  | { fase: 'sem-leitura' }
  | { fase: 'confirmando' }
  | { fase: 'erro' }

const INATIVA: EstadoPresenca = { fase: 'inativa' }

function lerContagem(chave: string): Contagem {
  try {
    const bruto = sessionStorage.getItem(chave)
    const c = bruto ? JSON.parse(bruto) as Contagem : null
    return c && typeof c === 'object' ? { desde: c.desde ?? null, vistoEm: c.vistoEm ?? null } : CONTAGEM_ZERO
  } catch {
    return CONTAGEM_ZERO
  }
}

function gravarContagem(chave: string, c: Contagem | null) {
  try {
    if (c) sessionStorage.setItem(chave, JSON.stringify(c))
    else sessionStorage.removeItem(chave)
  } catch { /* storage bloqueado: a contagem só não sobrevive ao F5 */ }
}

/**
 * Observa a chamada e, aos TEMPO_PRESENCA_MS de presença contínua, chama
 * `confirmar(desdeISO)` uma única vez. `confirmar` devolve false se não gravou —
 * aí a contagem para em 'erro' e sobra o botão manual (sem tentar de novo a cada
 * passo e martelar o banco).
 */
export function usePresencaAutomatica(
  resultado: ProfessorEncontrado | null,
  ligada: boolean,
  confirmar: (desdeISO: string) => Promise<boolean>,
): EstadoPresenca {
  const [estado, setEstado] = useState<EstadoPresenca>(INATIVA)
  const confirmarRef = useRef(confirmar)
  useEffect(() => { confirmarRef.current = confirmar })

  const participanteId = ligada && podeConfirmarSozinho(resultado) ? resultado!.reuniaoHoje!.participanteId : null
  const nome = resultado?.professor.nome ?? ''
  const motivo = resultado?.motivo ?? 'nome'

  useEffect(() => {
    if (!participanteId) return

    const chave = `ktm-presenca:${participanteId}`
    let contagem = lerContagem(chave)
    let semNomesDesde: number | null = null
    let disparou = false

    function passo() {
      if (disparou) return
      const agora = Date.now()
      const nomes = extrairCandidatos()
      semNomesDesde = nomes.length ? null : (semNomesDesde ?? agora)
      contagem = avancarContagem(contagem, professorNaChamada(nomes, nome, motivo), agora)
      gravarContagem(chave, contagem)

      if (tempoPresente(contagem) >= TEMPO_PRESENCA_MS) {
        disparou = true
        setEstado({ fase: 'confirmando' })
        confirmarRef.current(new Date(contagem.desde!).toISOString()).then(ok => {
          if (ok) gravarContagem(chave, null)
          else setEstado({ fase: 'erro' })
        })
        return
      }

      if (semNomesDesde != null && agora - semNomesDesde >= SEM_LEITURA_MS) setEstado({ fase: 'sem-leitura' })
      else if (contagem.desde != null) setEstado({ fase: 'contando', segundos: Math.floor(tempoPresente(contagem) / 1000) })
      else setEstado({ fase: 'aguardando' })
    }

    passo()
    const id = setInterval(passo, PASSO_MS)
    return () => clearInterval(id)
  }, [participanteId, nome, motivo])

  // Fora de uso, o estado guardado é da participação anterior — não vale mais.
  return participanteId ? estado : INATIVA
}
