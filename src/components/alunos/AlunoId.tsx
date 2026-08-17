// ─────────────────────────────────────────────────────────────────────────────
// Identificador do aluno (#48213).
//
// Por que isso existe: a API do King só nos manda o PRIMEIRO nome do aluno
// (`professor_alunos_kms.primeiro_nome`, interface `AlunoKms` no kms-api-sync).
// Dois alunos "Ana" na mesma agenda são indistinguíveis na tela, e quem atende
// uma transferência não tem como saber de qual se trata — nem como achar o
// cadastro completo no sistema do King.
//
// O `aluno_id` sempre esteve no banco; só nunca aparecia em lugar nenhum. Ele é
// a chave de junção com o King, então resolve as duas pontas: desempata
// homônimos aqui e é o que o Suporte ao Aluno cola na busca de lá.
//
// Quando o nome completo passar a vir da API, isto vira redundante para
// desempate — mas o ID continua sendo a chave canônica, então vale manter.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizarNome } from '@/hooks/useAcompanhamentoAlunos'
import { cn } from '@/lib/utils'

export function AlunoId({ id, className }: { id: number | null | undefined; className?: string }) {
  // Sem ID = pedido pelo caminho de escape ("não achei meu aluno na lista"), em
  // que o nome foi digitado à mão. Quem exibe já sinaliza isso com outro selo.
  if (id === null || id === undefined) return null

  return (
    <span
      title="Identificador do aluno no sistema do King — use para localizar o cadastro completo."
      className={cn('shrink-0 cursor-help tabular-nums text-ink-muted', className)}
    >
      #{id}
    </span>
  )
}

/**
 * Primeiros nomes que aparecem mais de uma vez na lista, já normalizados (sem
 * acento, minúsculos) para que "Ana" e "ANA" contem como o mesmo.
 *
 * Serve à nuvem de chips do roster, onde carimbar o ID em TODO aluno polui uma
 * agenda de 40: ali ele só aparece onde existe ambiguidade de verdade.
 */
export function nomesDuplicados(nomes: (string | null | undefined)[]): Set<string> {
  const contagem = new Map<string, number>()
  for (const nome of nomes) {
    const chave = normalizarNome(nome ?? '')
    if (!chave) continue
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
  }
  return new Set([...contagem.entries()].filter(([, qtd]) => qtd > 1).map(([chave]) => chave))
}
