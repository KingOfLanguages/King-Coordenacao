// ─────────────────────────────────────────────────────────────────────────────
// Os 3 textos-padrão de pendência de lançamento (1ª, 2ª e 3ª mensagem),
// idênticos aos do guia da API do King. Quem escolhe qual usar é o estágio da
// régua do King — ver mensagemDoEstagio() em centralPendencias.ts. A régua local
// (6/9/12 dias) que dava nome a esses modelos foi aposentada em 2026-09.
// ─────────────────────────────────────────────────────────────────────────────

/** Qual dos 3 textos: 1ª mensagem (lembrete), 2ª (bloqueio), 3ª (reunião). */
export type ModeloMensagem = 'alerta' | 'aviso_saida' | 'reuniao'

export function mensagemPendencia(status: ModeloMensagem, nome: string, aulasPendentes: number): string {
  switch (status) {
    case 'alerta':
      return `Olá, ${nome}! Tudo bem?

Notamos que você já possui ${aulasPendentes} aulas pendentes de lançamento na plataforma.

Gostaríamos de reforçar a importância de manter esses registros sempre atualizados. O lançamento das aulas é essencial para garantir o acompanhamento das atividades, a organização da agenda e o correto funcionamento dos processos internos.

Pedimos, por gentileza, que realize os lançamentos o quanto antes. Caso as pendências continuem se acumulando, sua agenda poderá ser bloqueada temporariamente para o recebimento de novos alunos.

Se estiver enfrentando qualquer dificuldade para realizar os lançamentos, conte com a coordenação. Estamos à disposição para ajudar.`

    case 'aviso_saida':
      return `Olá, ${nome}! Tudo bem?

Percebemos que as aulas pendentes ainda não foram lançadas na plataforma. Por isso, gostaríamos de reforçar novamente a importância dessa atividade.

O lançamento das aulas vai além de um procedimento administrativo: ele garante transparência sobre as atividades realizadas, permite o acompanhamento adequado dos alunos e assegura o correto funcionamento dos processos da escola.

A ausência contínua desses registros pode comprometer esse acompanhamento e, caso a situação permaneça, poderá resultar na retirada dos alunos da sua agenda e em outras medidas administrativas.

Pedimos que regularize os lançamentos o quanto antes. Se houver qualquer dificuldade, entre em contato com a coordenação para que possamos auxiliá-lo.`

    case 'reuniao':
      return `Olá, ${nome}! Tudo bem?

Como as pendências de lançamento de aulas permanecem sem regularização, será necessário aplicar o mês de análise, conforme os procedimentos da coordenação.

Durante esse período, sua agenda permanecerá bloqueada para o recebimento de novos alunos, e avaliaremos a continuidade da nossa parceria. Além disso, será necessário agendar uma reunião com a coordenação para conversarmos sobre a situação, esclarecer eventuais dúvidas e alinhar os próximos passos para a regularização.

Assim que a reunião for realizada e a situação for analisada, avaliaremos a liberação da agenda.

Contamos com sua colaboração e permanecemos à disposição para qualquer esclarecimento.`
  }
}
