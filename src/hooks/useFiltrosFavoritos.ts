import { useCallback, useEffect, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Filtros favoritos salvos em localStorage (por usuário/navegador).
// Sem migração de banco — conjuntos de filtros do painel de Acompanhamento que
// o usuário salva e reaplica. Genérico sobre o formato dos filtros.
// ─────────────────────────────────────────────────────────────────────────────

export interface FiltroFavorito<T> {
  id: string
  nome: string
  filtros: T
}

const PREFIXO = 'painel-filtros-favoritos'

function chaveDe(userId: string | undefined): string {
  return `${PREFIXO}:${userId ?? 'anon'}`
}

function carregar<T>(chave: string): FiltroFavorito<T>[] {
  try {
    const cru = localStorage.getItem(chave)
    if (!cru) return []
    const parsed = JSON.parse(cru)
    return Array.isArray(parsed) ? (parsed as FiltroFavorito<T>[]) : []
  } catch {
    return []
  }
}

function novoId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}

export function useFiltrosFavoritos<T>(userId: string | undefined) {
  const chave = chaveDe(userId)
  const [favoritos, setFavoritos] = useState<FiltroFavorito<T>[]>(() => carregar<T>(chave))
  const [chaveAtual, setChaveAtual] = useState(chave)

  // Recarrega ao trocar de usuário (ex.: profile.id chega depois do 1º render):
  // ajuste de estado durante o render — padrão recomendado do React, sem efeito.
  if (chave !== chaveAtual) {
    setChaveAtual(chave)
    setFavoritos(carregar<T>(chave))
  }

  // Persiste a cada mudança (sincroniza com o localStorage; sem setState aqui).
  useEffect(() => {
    try {
      localStorage.setItem(chave, JSON.stringify(favoritos))
    } catch {
      /* storage cheio/indisponível — ignora */
    }
  }, [chave, favoritos])

  const adicionar = useCallback((nome: string, filtros: T) => {
    setFavoritos(atual => [...atual, { id: novoId(), nome: nome.trim(), filtros }])
  }, [])

  const remover = useCallback((id: string) => {
    setFavoritos(atual => atual.filter(f => f.id !== id))
  }, [])

  return { favoritos, adicionar, remover }
}
