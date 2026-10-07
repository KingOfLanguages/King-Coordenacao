import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { invocarFuncao, sessaoRecusada } from '@/lib/invocarFuncao'
import { lerToken, gravarToken, limparToken } from '@/lib/portalSession'

// ─────────────────────────────────────────────────────────────────────────────
// Identidade dos portais do professor (`portal-identidade`): e-mail ou nome só
// localizam o cadastro; quem entra é quem digita o código que chegou no e-mail
// oficial. A sessão resultante vale nos 4 portais.
// ─────────────────────────────────────────────────────────────────────────────

export type ProfessorPortal = { id: string; nome: string }

export type SolicitarCodigoInput = {
  email?: string
  nome?: string
  mesInicio?: number
  anoInicio?: number
}

/** "enviado" vem igual exista o cadastro ou não — o servidor não diz quem
 *  existe. Só o homônimo ("ambiguo") pede o mês/ano de início. */
export type SolicitarCodigoResult =
  | { status: 'enviado'; desafio: string }
  | { status: 'ambiguo' }

export function useSolicitarCodigo() {
  return useMutation({
    mutationFn: (input: SolicitarCodigoInput) =>
      invocarFuncao<SolicitarCodigoResult>('portal-identidade', { acao: 'solicitar', ...input }),
  })
}

export function useVerificarCodigo() {
  return useMutation({
    mutationFn: (input: { desafio: string; codigo: string }) =>
      invocarFuncao<{ token: string; expiraEm: string; professor: ProfessorPortal }>(
        'portal-identidade', { acao: 'verificar', ...input },
      ),
  })
}

/**
 * Sessão do portal neste dispositivo: o token guardado, quem é o professor e
 * como sair. `invalidar()` é para quando uma chamada do portal volta 401 — a
 * sessão morreu no servidor e a tela volta para a identificação.
 */
export function usePortalSessao() {
  const [token, setToken] = useState<string | null>(() => lerToken())

  const sessao = useQuery({
    queryKey: ['portal', 'sessao', token],
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
    queryFn: () => invocarFuncao<{ professor: ProfessorPortal }>(
      'portal-identidade', { acao: 'sessao', token },
    ),
  })

  if (token && sessao.isError && sessaoRecusada(sessao.error)) {
    limparToken()
    setToken(null)
  }

  function entrar(novo: string) {
    gravarToken(novo)
    setToken(novo)
  }

  function invalidar() {
    limparToken()
    setToken(null)
  }

  async function sair() {
    const atual = token
    invalidar()
    if (atual) {
      try { await invocarFuncao('portal-identidade', { acao: 'sair', token: atual }) } catch { /* já saiu localmente */ }
    }
  }

  return {
    token,
    professor: sessao.data?.professor ?? null,
    carregando: !!token && sessao.isLoading,
    entrar,
    sair,
    invalidar,
  }
}
