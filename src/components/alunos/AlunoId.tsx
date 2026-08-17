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

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { normalizarNome } from '@/hooks/useAcompanhamentoAlunos'
import { cn } from '@/lib/utils'

export function AlunoId({ id, className }: { id: number | null | undefined; className?: string }) {
  const [copiado, setCopiado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // O "copiado" se apaga sozinho; se a linha sumir antes (a fila re-renderiza a
  // cada mutação), o timer não pode disparar setState em componente desmontado.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // Sem ID = pedido pelo caminho de escape ("não achei meu aluno na lista"), em
  // que o nome foi digitado à mão. Quem exibe já sinaliza isso com outro selo.
  if (id === null || id === undefined) return null

  async function copiar(e: React.MouseEvent) {
    // Vários destes ficam dentro de linhas clicáveis (expandir, abrir perfil):
    // copiar o ID não pode disparar a ação da linha.
    e.preventDefault()
    e.stopPropagation()
    try {
      // Só o número — é o que se cola na busca do King, sem o "#".
      await navigator.clipboard.writeText(String(id))
      setCopiado(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopiado(false), 1500)
    } catch {
      // clipboard exige contexto seguro (https/localhost) e permissão. Se falhar,
      // mostra o número pra copiar na mão em vez de fingir que deu certo.
      toast.error(`Não consegui copiar. O ID do aluno é ${id}.`)
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title={copiado
        ? 'Copiado!'
        : `Copiar o ID ${id} — é por ele que se acha o cadastro completo no sistema do King.`}
      aria-label={copiado ? `ID ${id} copiado` : `Copiar o ID do aluno, ${id}`}
      className={cn(
        'group/aluno-id inline-flex shrink-0 items-center gap-0.5 rounded tabular-nums',
        'text-ink-muted transition-colors hover:text-accentBlue',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accentBlue',
        className,
      )}
    >
      #{id}
      {/* O ícone ocupa espaço mesmo invisível — senão a linha "pula" no hover. */}
      {copiado
        ? <Check className="h-2.5 w-2.5 shrink-0 text-urg-lowFg" />
        : <Copy className="h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover/aluno-id:opacity-70" />}
    </button>
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
