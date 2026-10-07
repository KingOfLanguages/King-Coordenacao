import { useMemo, useState } from 'react'
import {
  UserCog, CheckCircle2, AlertTriangle, ChevronLeft, Users, Clock,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CartaoPortal, AvisoErro, BotaoPrimario, FundoPortal, AvatarPortal,
} from '@/components/portal/PortalUI'
import {
  MOTIVOS_TRANSFERENCIA, diasUteisLabel,
  PRAZO_DIAS_UTEIS, ANTECEDENCIA_MIN_DIAS, FUTURO_MAX_DIAS,
  HORARIO_MIN_CHARS, HORARIO_MAX_CHARS,
  type MotivoTransferencia,
} from '@/lib/transferenciaLabels'
import { diasUteisEntre, hojeLocal, parseISODate } from '@/lib/diasUteis'
import { dataBR } from '@/lib/formato'
import {
  useTransferenciaEstado, useSolicitarTransferencia, type AlunoPortal,
} from '@/hooks/usePortalTransferencia'
import { usePortalSessao } from '@/hooks/usePortalIdentidade'
import { IdentificacaoPortal } from '@/components/portal/IdentificacaoPortal'
import { sessaoRecusada } from '@/lib/invocarFuncao'
import { cn } from '@/lib/utils'

const DETALHE_MIN = 15


/** Data ISO de N dias de calendário a partir de hoje — limites do input date. */
function isoEmDias(n: number): string {
  const d = hojeLocal()
  d.setDate(d.getDate() + n)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Aluno do pedido — só o nome completo que o professor digitou. O vínculo
 *  com o cadastro (aluno_id) é deduzido no servidor, não vem daqui. */
type AlunoEscolhido = { nome: string }

type Step =
  // Logo depois de entrar: vira 'nome-aluno' assim que a carteira chega.
  | { tipo: 'inicio' }
  // Nome do aluno: o professor DIGITA o nome completo. A API do King só nos dá
  // o primeiro nome, então é aqui que o nome completo entra no sistema. O
  // vínculo com o cadastro (aluno_id) é deduzido no servidor, pelo primeiro nome.
  | { tipo: 'nome-aluno'; professorId: string; nome: string; alunos: AlunoPortal[]; digitado: string; erro: string }
  | {
      tipo: 'formulario'; professorId: string; nome: string; alunos: AlunoPortal[]
      aluno: AlunoEscolhido
      motivo: MotivoTransferencia | ''
      detalhe: string
      dataUltimaAula: string
      horarioAtual: string
      querMudarHorario: boolean | null
      horarioDesejado: string
      jaConversou: boolean | null
      aceitaManter: boolean | null
      erro: string
    }
  | { tipo: 'confirmacao'; nome: string; alunoNome: string; dataUltimaAula: string }

export function Home() {
  const { token, entrar, sair: sairSessao, invalidar } = usePortalSessao()
  const estado    = useTransferenciaEstado(token)
  const solicitar = useSolicitarTransferencia()

  const [stepBruto, setStep] = useState<Step>({ tipo: 'inicio' })

  if (token && estado.isError && sessaoRecusada(estado.error)) invalidar()

  // Primeira tela depois de entrar: o nome do aluno, com a carteira do servidor.
  const step: Step = stepBruto.tipo === 'inicio' && estado.data
    ? {
        tipo: 'nome-aluno',
        professorId: estado.data.professor.id,
        nome: estado.data.professor.nome,
        alunos: estado.data.alunos,
        digitado: '', erro: '',
      }
    : stepBruto

  function recomecar() {
    setStep({ tipo: 'inicio' })
    void sairSessao()
  }

  function escolherAluno(aluno: AlunoEscolhido) {
    if (step.tipo !== 'nome-aluno') return
    setStep({
      tipo: 'formulario',
      professorId: step.professorId,
      nome: step.nome,
      alunos: step.alunos,
      aluno,
      motivo: '', detalhe: '', dataUltimaAula: '',
      horarioAtual: '', querMudarHorario: null, horarioDesejado: '',
      jaConversou: null, aceitaManter: null,
      erro: '',
    })
  }

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault()
    if (step.tipo !== 'formulario' || !token) return

    if (!step.motivo) {
      setStep({ ...step, erro: 'Escolha o motivo da transferência.' })
      return
    }
    if (step.detalhe.trim().length < DETALHE_MIN) {
      setStep({ ...step, erro: 'Conte com um pouco mais de detalhe o que está acontecendo — é o que orienta quem vai atender.' })
      return
    }
    if (!step.dataUltimaAula) {
      setStep({ ...step, erro: 'Informe a data da última aula do aluno.' })
      return
    }
    if (step.dataUltimaAula < isoEmDias(ANTECEDENCIA_MIN_DIAS)) {
      setStep({ ...step, erro: 'A última aula precisa ser a partir de amanhã. Se a aula já aconteceu, fale com o suporte.' })
      return
    }
    if (step.horarioAtual.trim().length < HORARIO_MIN_CHARS) {
      setStep({ ...step, erro: 'Informe o horário em que o aluno tem aula com você hoje.' })
      return
    }
    if (step.querMudarHorario === null) {
      setStep({ ...step, erro: 'Responda se o aluno quer mudar de horário.' })
      return
    }
    if (step.querMudarHorario && step.horarioDesejado.trim().length < HORARIO_MIN_CHARS) {
      setStep({ ...step, erro: 'Informe para qual horário o aluno quer mudar.' })
      return
    }

    try {
      await solicitar.mutateAsync({
        token,
        alunoNome: step.aluno.nome,
        motivo: step.motivo,
        detalhe: step.detalhe.trim(),
        dataUltimaAula: step.dataUltimaAula,
        horarioAtual: step.horarioAtual.trim(),
        querMudarHorario: step.querMudarHorario,
        horarioDesejado: step.querMudarHorario ? step.horarioDesejado.trim() : '',
        jaConversou: step.jaConversou,
        aceitaManter: step.aceitaManter,
      })
      setStep({
        tipo: 'confirmacao', nome: step.nome, alunoNome: step.aluno.nome,
        dataUltimaAula: step.dataUltimaAula,
      })
    } catch (err) {
      if (sessaoRecusada(err)) { invalidar(); return }
      setStep({ ...step, erro: err instanceof Error ? err.message : 'Não foi possível registrar agora. Tente novamente.' })
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-surface-app flex items-center justify-center p-6">
      <FundoPortal />

      <div className="relative z-10 flex items-center justify-center w-full">
        {!token && (
          <IdentificacaoPortal
            icone={UserCog}
            titulo="Transferência de aluno"
            descricao="Informe seu e-mail cadastrado para pedir a transferência de um aluno da sua agenda."
            onEntrar={entrar}
          />
        )}

        {token && step.tipo === 'inicio' && (
          estado.isError
            ? <div className="w-full max-w-sm"><AvisoErro>Não foi possível carregar seus dados agora. Recarregue a página em instantes.</AvisoErro></div>
            : <p className="text-[13px] text-ink-muted">Carregando…</p>
        )}

        {token && step.tipo === 'nome-aluno' && (
          <NomeDoAluno
            step={step}
            onDigitar={v => setStep({ ...step, digitado: v, erro: '' })}
            onErro={v => setStep({ ...step, erro: v })}
            onConfirmar={escolherAluno}
            onRecomecar={recomecar}
          />
        )}

        {token && step.tipo === 'formulario' && (
          <div className="w-full max-w-md space-y-6 animate-fade-up">
            <div className="flex flex-col items-center gap-3.5 text-center">
              <AvatarPortal nome={step.nome} />
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Transferir {step.aluno.nome}
                </h1>
                <p className="text-[13px] text-ink-muted">{step.nome}</p>
              </div>
            </div>

            <CartaoPortal>
              <form onSubmit={handleEnviar} className="space-y-5">
                {/* O compromisso da operação, dito antes de o professor preencher —
                    é o que torna a régua de prazo justa. */}
                <Aviso tom="info" icone={Clock} titulo="Prazo de transferência">
                  Alunos serão transferidos em até <strong className="font-semibold">{diasUteisLabel(PRAZO_DIAS_UTEIS)}</strong>{' '}
                  após a data de envio deste formulário.
                </Aviso>

                {/* Motivo */}
                <div className="space-y-2">
                  <Label className="text-[12px] text-ink-secondary font-medium">
                    Qual o motivo?
                  </Label>
                  <div className="space-y-1.5">
                    {MOTIVOS_TRANSFERENCIA.map(m => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setStep({ ...step, motivo: m.value, erro: '' })}
                        className={cn(
                          'btn-press w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                          step.motivo === m.value
                            // aviso-info* em vez de accentBlue-soft: este vira com
                            // o tema, aquele ficava quase-branco no escuro.
                            ? 'border-accentBlue bg-aviso-infoBg'
                            : 'border-line-soft bg-surface-subtle hover:border-line',
                        )}
                      >
                        <span className={cn(
                          'block text-[13px] font-medium',
                          step.motivo === m.value ? 'text-aviso-infoFg' : 'text-ink',
                        )}>
                          {m.label}
                        </span>
                        <span className="block text-[11.5px] text-ink-muted mt-0.5">{m.ajuda}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Relato */}
                <div className="space-y-1.5">
                  <Label htmlFor="detalhe" className="text-[12px] text-ink-secondary font-medium">
                    O que está acontecendo?
                  </Label>
                  <textarea
                    id="detalhe"
                    value={step.detalhe}
                    onChange={ev => setStep({ ...step, detalhe: ev.target.value })}
                    required
                    rows={4}
                    placeholder="Descreva a situação com o aluno. Quanto mais contexto, melhor o suporte consegue resolver."
                    className="w-full resize-none rounded-xl border border-line-soft bg-surface-subtle px-3 py-2
                               text-[13px] text-ink placeholder:text-ink-subtle transition-colors
                               focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue"
                  />
                  <p className="text-[11.5px] text-ink-muted">
                    Esse relato vai direto para a equipe de Suporte ao Aluno.
                  </p>
                </div>

                {/* Horário das aulas — é o que decide para QUEM o aluno pode ir.
                    Sem isso, quem atende liga para o professor só pra perguntar
                    o dia e a hora, e a busca do próximo professor só começa
                    depois disso. */}
                <div className="space-y-3 rounded-xl border border-line-soft bg-surface-subtle px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-3.5 w-3.5 text-ink-muted" />
                    <span className="text-[12px] font-semibold text-ink-secondary">Horário das aulas</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="horario-atual" className="text-[12px] text-ink-secondary font-medium">
                      Em que horário o aluno faz aula com você hoje?
                    </Label>
                    <Input
                      id="horario-atual"
                      type="text"
                      value={step.horarioAtual}
                      maxLength={HORARIO_MAX_CHARS}
                      onChange={ev => setStep({ ...step, horarioAtual: ev.target.value, erro: '' })}
                      required
                      placeholder="Ex.: terça e quinta, 19h"
                      className="h-10 bg-surface-canvas border-line-soft text-[13px] rounded-xl"
                    />
                    <p className="text-[11.5px] text-ink-muted">
                      Escreva os dias da semana e o horário das aulas dele.
                    </p>
                  </div>

                  <PerguntaSimNao
                    pergunta="O aluno quer mudar de horário?"
                    valor={step.querMudarHorario}
                    onChange={v => setStep({ ...step, querMudarHorario: v, erro: '' })}
                  />

                  {step.querMudarHorario === true && (
                    <div className="space-y-1.5">
                      <Label htmlFor="horario-desejado" className="text-[12px] text-ink-secondary font-medium">
                        Para qual horário?
                      </Label>
                      <Input
                        id="horario-desejado"
                        type="text"
                        value={step.horarioDesejado}
                        maxLength={HORARIO_MAX_CHARS}
                        onChange={ev => setStep({ ...step, horarioDesejado: ev.target.value, erro: '' })}
                        required
                        autoFocus
                        placeholder="Ex.: segunda e quarta, a partir das 18h"
                        className="h-10 bg-surface-canvas border-line-soft text-[13px] rounded-xl"
                      />
                      <p className="text-[11.5px] text-ink-muted">
                        Se ele deu mais de uma opção, escreva todas — quanto mais alternativas, mais rápido achamos o próximo professor.
                      </p>
                    </div>
                  )}
                </div>

                {/* Dois sinais que mudam a conduta de quem atende */}
                <div className="space-y-3 rounded-xl border border-line-soft bg-surface-subtle px-3.5 py-3">
                  <PerguntaSimNao
                    pergunta="Você já conversou com o aluno sobre isso?"
                    valor={step.jaConversou}
                    onChange={v => setStep({ ...step, jaConversou: v })}
                  />
                  <PerguntaSimNao
                    pergunta="Você manteria o aluno se houvesse algum ajuste?"
                    valor={step.aceitaManter}
                    onChange={v => setStep({ ...step, aceitaManter: v })}
                  />
                </div>

                {/* Última aula — é ela que define a urgência do pedido */}
                <div className="space-y-1.5">
                  <Label htmlFor="ultima-aula" className="text-[12px] text-ink-secondary font-medium">
                    Data da última aula
                  </Label>
                  <Input
                    id="ultima-aula"
                    type="date"
                    value={step.dataUltimaAula}
                    min={isoEmDias(ANTECEDENCIA_MIN_DIAS)}
                    max={isoEmDias(FUTURO_MAX_DIAS)}
                    onChange={ev => setStep({ ...step, dataUltimaAula: ev.target.value, erro: '' })}
                    required
                    className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
                  />
                  <p className="text-[11.5px] text-ink-muted">
                    O <strong>último dia em que o aluno estará presente</strong> para ter aula com você.
                  </p>
                  <AvisoPrazo data={step.dataUltimaAula} />
                </div>

                {step.erro && <AvisoErro>{step.erro}</AvisoErro>}

                <BotaoPrimario pending={solicitar.isPending} pendingLabel="Enviando…">
                  Enviar pedido
                </BotaoPrimario>

                <button
                  type="button"
                  onClick={() => setStep({
                    tipo: 'nome-aluno',
                    professorId: step.professorId,
                    nome: step.nome,
                    alunos: step.alunos,
                    digitado: step.aluno.nome, erro: '',
                  })}
                  className="btn-press w-full inline-flex items-center justify-center gap-1 text-[12px] text-ink-muted hover:text-ink-secondary"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />Corrigir o nome do aluno
                </button>
              </form>
            </CartaoPortal>
          </div>
        )}

        {step.tipo === 'confirmacao' && (
          <div className="w-full max-w-md space-y-6 text-center animate-fade-up">
            <div className="flex flex-col items-center gap-3.5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-urg-lowBg text-urg-lowFg shadow-inner-top">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Pedido registrado!
                </h1>
                <p className="text-[13.5px] text-ink-muted leading-relaxed">
                  Recebemos seu pedido de transferência de <strong>{step.alunoNome}</strong>,{' '}
                  {step.nome.split(' ')[0]}. A equipe de Suporte ao Aluno vai analisar e entrar em contato.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-line-soft bg-surface-canvas px-5 py-3 text-left">
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-ink-muted">Último dia de disponibilidade informado</span>
                <span className="font-medium text-ink tabular-nums">{dataBR(step.dataUltimaAula)}</span>
              </div>
            </div>

            {/* A retirada do aluno da agenda é o que vale — e ela pode acontecer
                ANTES da data informada, porque o próximo professor precisa
                pegar o aluno sem buraco entre uma aula e outra. O professor que
                para de atender na data que ele mesmo escreveu deixa o aluno sem
                aula no meio; é isso que este aviso evita. */}
            <div className="text-left">
              <Aviso tom="alerta" icone={AlertTriangle} titulo="Aviso importante">
                <p>
                  Sua solicitação de transferência foi enviada e será analisada pela nossa equipe.
                </p>
                <p>
                  Até que o aluno seja efetivamente retirado da sua agenda,{' '}
                  <strong className="font-semibold">continue atendendo-o normalmente</strong>, conforme
                  sua disponibilidade e os horários já estabelecidos.
                </p>
                <p>
                  A transferência será considerada válida{' '}
                  <strong className="font-semibold">a partir do momento em que o aluno for retirado
                  da sua agenda</strong>. Para garantir a continuidade das aulas e o acesso do aluno a
                  outro professor,{' '}
                  <strong className="font-semibold">a retirada poderá ocorrer antes da data definida
                  como seu último dia de aula</strong>.
                </p>
                <p>
                  Por isso, a data informada como último dia de disponibilidade{' '}
                  <strong className="font-semibold">não representa necessariamente a data em que o
                  aluno permanecerá em sua agenda</strong>. Aguarde a confirmação da transferência e a
                  efetiva retirada do aluno antes de interromper os atendimentos.
                </p>
              </Aviso>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Passo: escolher o aluno ─────────────────────────────────────────────────
// A lista vem do cadastro do King, não é digitada. É isso que faz o pedido
// nascer amarrado ao aluno certo — e é o que dá ao suporte o histórico dele.

/**
 * Identificação do aluno — o professor DIGITA o nome completo.
 *
 * Antes ele escolhia da própria agenda, e o pedido nascia com aluno_id. O
 * problema: a API do King só nos entrega o PRIMEIRO nome, então a fila do
 * Suporte ao Aluno via "Ana" e não tinha como saber qual Ana era, nem como
 * achar o cadastro completo do outro lado.
 *
 * Quem sabe o nome completo é o professor. Então é ele quem preenche essa
 * lacuna, e o vínculo com o cadastro (aluno_id) passou a ser deduzido no
 * servidor pelo primeiro nome digitado — sem pedir nada a mais dele.
 *
 * A agenda continua sendo mostrada, mas só como referência de quem está com
 * ele: não dá pra clicar, porque o nome completo é justamente o que ela não
 * tem.
 */
function NomeDoAluno({
  step, onDigitar, onErro, onConfirmar, onRecomecar,
}: {
  step: Extract<Step, { tipo: 'nome-aluno' }>
  onDigitar: (v: string) => void
  onErro: (v: string) => void
  onConfirmar: (aluno: AlunoEscolhido) => void
  onRecomecar: () => void
}) {
  const digitado = step.digitado.trim()
  const partes = digitado.split(/\s+/).filter(t => t.length >= 2)
  const completo = partes.length >= 2

  // Primeiros nomes da agenda, só pra lembrar quem ele tem. Não é escolha.
  const primeirosNomes = useMemo(
    () => step.alunos.map(a => a.nome).filter(Boolean),
    [step.alunos],
  )

  function confirmar(e: React.FormEvent) {
    e.preventDefault()
    if (!digitado) {
      onErro('Digite o nome do aluno.')
      return
    }
    if (!completo) {
      onErro('Escreva o nome completo — nome e sobrenome.')
      return
    }
    onConfirmar({ nome: digitado })
  }

  return (
    <div className="w-full max-w-md space-y-6 animate-fade-up">
      <div className="flex flex-col items-center gap-3.5 text-center">
        <AvatarPortal nome={step.nome} />
        <div className="space-y-1.5">
          <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
            Qual aluno você quer transferir?
          </h1>
          <p className="text-[13px] text-ink-muted">
            Escreva o nome completo, como está na matrícula.
          </p>
        </div>
      </div>

      <CartaoPortal>
        <form onSubmit={confirmar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="aluno-nome" className="text-[12px] text-ink-secondary font-medium">
              Nome completo do aluno
            </Label>
            <Input
              id="aluno-nome"
              value={step.digitado}
              onChange={e => onDigitar(e.target.value)}
              placeholder="Ex.: Ana Beatriz Silva"
              autoFocus
              autoComplete="off"
              className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
            />
            <p className="text-[11.5px] text-ink-muted">
              O nome completo é o que permite ao suporte achar o cadastro certo —
              principalmente quando dois alunos têm o mesmo primeiro nome.
            </p>
          </div>

          {primeirosNomes.length > 0 && (
            <div className="rounded-xl border border-line-soft bg-surface-subtle px-3.5 py-2.5 space-y-1.5">
              <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-secondary">
                <Users className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                Alunos na sua agenda
              </p>
              <p className="text-[11.5px] text-ink-muted leading-relaxed">
                {primeirosNomes.join(' · ')}
              </p>
              <p className="text-[11px] text-ink-subtle">
                O cadastro guarda só o primeiro nome — por isso precisamos que você
                escreva o resto.
              </p>
            </div>
          )}

          {step.erro && <AvisoErro>{step.erro}</AvisoErro>}

          <BotaoPrimario type="submit">
            Continuar
          </BotaoPrimario>
        </form>

        <button
          type="button"
          onClick={onRecomecar}
          className="btn-press mt-3 w-full text-[12px] text-ink-muted hover:text-ink-secondary"
        >
          Não sou eu
        </button>
      </CartaoPortal>
    </div>
  )
}

/**
 * Retorno ao vivo sobre o prazo, assim que o professor escolhe a data.
 *
 * Avisar ANTES de enviar é deliberado: o pedido com menos de 7 dias úteis vira
 * informe negativo no perfil dele, e marcar alguém por uma regra que ele só
 * descobre depois seria injusto. Quem precisa mesmo pedir em cima da hora
 * segue podendo — só não vai ser pego de surpresa.
 */
function AvisoPrazo({ data }: { data: string }) {
  if (!data) return null
  const alvo = parseISODate(data)
  if (!alvo) return null

  const hoje = hojeLocal()
  if (alvo < hoje) return null

  const uteis = diasUteisEntre(hoje, alvo)
  const dentro = uteis >= PRAZO_DIAS_UTEIS

  return (
    <Aviso
      tom={dentro ? 'ok' : 'alerta'}
      icone={dentro ? CheckCircle2 : AlertTriangle}
      titulo={`${dataBR(data)} · ${diasUteisLabel(uteis)} de antecedência`}
    >
      {dentro
        ? `Dentro do prazo de ${diasUteisLabel(PRAZO_DIAS_UTEIS)}.`
        : `Abaixo do prazo de ${diasUteisLabel(PRAZO_DIAS_UTEIS)} — este pedido será registrado como informe negativo no seu perfil. Se conseguir uma data mais adiante, ajuste acima.`}
    </Aviso>
  )
}

// ─── Aviso ────────────────────────────────────────────────────────────────────

/**
 * Faixa de aviso do portal, legível nos DOIS temas.
 *
 * O problema que isto resolve: urgency e accent NÃO têm variante no bloco
 * `.dark` do index.css ("Brand same + urgency same"). Então `bg-accentBlue-soft`
 * continua sendo um azul quase branco no tema escuro, enquanto
 * `text-ink-secondary` vira cinza claro — cinza sobre quase-branco.
 *
 * Duas saídas foram descartadas, nesta ordem:
 *   1. consertar urgency no `.dark` — `bg-urg-*Fg` é fundo sólido com texto
 *      branco em ~57 lugares; clarear o token quebraria todos;
 *   2. tingir com opacidade (`dark:bg-accentBlue/12`) — NÃO funciona: as cores
 *      do tema são `var()` sem `<alpha-value>`, e no Tailwind 3 o modificador
 *      de opacidade nesse caso gera cor inválida. O elemento fica transparente
 *      e nada avisa. (Medido: `bg-accentBlue/12` → `rgba(0,0,0,0)`.)
 *
 * Por isso os tokens `--aviso-*`, que são o único bloco de cor de destaque com
 * par claro/escuro de verdade. Tudo sólido, nada de opacidade.
 *
 * A bolha do ícone inverte o par (fundo = cor do texto, ícone = cor do fundo),
 * então ela contrasta nos dois temas sem precisar de mais um token.
 */
const AVISO_TONS = {
  info: {
    caixa:  'border-aviso-infoBd bg-aviso-infoBg',
    bolha:  'bg-aviso-infoFg text-aviso-infoBg',
    titulo: 'text-aviso-infoFg',
  },
  ok: {
    caixa:  'border-aviso-okBd bg-aviso-okBg',
    bolha:  'bg-aviso-okFg text-aviso-okBg',
    titulo: 'text-aviso-okFg',
  },
  alerta: {
    caixa:  'border-aviso-warnBd bg-aviso-warnBg',
    bolha:  'bg-aviso-warnFg text-aviso-warnBg',
    titulo: 'text-aviso-warnFg',
  },
} as const

function Aviso({
  tom, icone: Icone, titulo, children,
}: {
  tom: keyof typeof AVISO_TONS
  icone: LucideIcon
  titulo: string
  children: React.ReactNode
}) {
  const t = AVISO_TONS[tom]
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-3.5 py-3', t.caixa)}>
      <span className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm',
        t.bolha,
      )}>
        <Icone className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className={cn('text-[12.5px] font-semibold leading-snug', t.titulo)}>{titulo}</p>
        {/* div, e não p: o aviso da tela de confirmação tem vários parágrafos,
            e <p> dentro de <p> o navegador desmonta sozinho. */}
        <div className="space-y-2 text-[12px] leading-relaxed text-ink-secondary">{children}</div>
      </div>
    </div>
  )
}

/** Par sim/não do formulário. Se responder é obrigatório ou não fica com quem
 *  usa: os dois sinais de mediação são opcionais de propósito (obrigar resposta
 *  aumentaria o abandono), enquanto a troca de horário é exigida — é ela que
 *  define a busca do próximo professor, e um pedido sem ela volta pro suporte
 *  como uma ligação a mais. */
function PerguntaSimNao({
  pergunta, valor, onChange,
}: { pergunta: string; valor: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] text-ink-secondary leading-snug">{pergunta}</span>
      <div className="flex shrink-0 gap-1">
        {([['Sim', true], ['Não', false]] as const).map(([label, v]) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              'btn-press h-7 rounded-full px-3 text-[12px] font-medium transition-colors',
              valor === v
                ? 'bg-ink text-ink-inverse'
                : 'border border-line-soft bg-surface-canvas text-ink-secondary hover:border-line',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
