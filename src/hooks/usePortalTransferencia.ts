import { useMutation, useQuery } from '@tanstack/react-query'
import { invocarFuncao } from '@/lib/invocarFuncao'
import type { MotivoTransferencia } from '@/lib/transferenciaLabels'

// Portal de transferência (`portal-transferencia`). Quem é o professor vem do
// token da sessão (`portal-identidade`), nunca de um id mandado daqui.
const invocar = <T,>(body: Record<string, unknown>) => invocarFuncao<T>('portal-transferencia', body)

/** Um aluno da carteira do professor, como o portal o enxerga. */
export type AlunoPortal = {
  alunoId: number
  nome: string
  dataAdicao: string | null
  status: string | null
  /** Já existe pedido em andamento para este aluno — a opção fica travada. */
  pedidoAberto: boolean
}

export type TransferenciaEstado = {
  professor: { id: string; nome: string }
  /** Carteira do professor (só vínculos individuais, turmas ficam de fora). */
  alunos: AlunoPortal[]
  jaPausado: boolean
}

/** Professor da sessão + carteira de alunos, que o formulário usa para deduzir
 *  o vínculo do aluno digitado. */
export function useTransferenciaEstado(token: string | null) {
  return useQuery({
    queryKey: ['portal', 'transferencia', token],
    enabled: !!token,
    retry: false,
    queryFn: () => invocar<TransferenciaEstado>({ acao: 'estado', token }),
  })
}

export type SolicitarTransferenciaInput = {
  token: string
  /** O professor digita o nome completo; o vínculo com o cadastro (aluno_id) é
   *  deduzido no servidor pelo primeiro nome — por isso não vai daqui. */
  alunoNome: string
  motivo: MotivoTransferencia
  detalhe: string
  /** ISO YYYY-MM-DD — último dia em que o aluno terá aula. Define a urgência
   *  do pedido; não existe mais urgência declarada. */
  dataUltimaAula: string
  /** Dias/horários em que o aluno tem aula hoje — é o que orienta a busca do
   *  próximo professor. Texto livre, obrigatório. */
  horarioAtual: string
  /** O aluno quer trocar de horário junto com a troca de professor. */
  querMudarHorario: boolean | null
  /** Só vai quando `querMudarHorario` é true. */
  horarioDesejado: string
  jaConversou: boolean | null
  aceitaManter: boolean | null
}

/** Registra o pedido. Erros de validação (aluno fora da carteira, pedido já
 *  aberto para o mesmo aluno) voltam com mensagem pronta para exibir. */
export function useSolicitarTransferencia() {
  return useMutation({
    mutationFn: (input: SolicitarTransferenciaInput) =>
      invocar<{ ok: true; transferenciaId: string }>({
        acao: 'solicitar', ...input,
      }),
  })
}
