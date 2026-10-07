import { useState } from 'react'
import { PauseCircle, CheckCircle2, CalendarClock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CartaoPortal, AvisoErro, BotaoPrimario, BotaoWhatsApp, FundoPortal, AvatarPortal,
} from '@/components/portal/PortalUI'
import { IdentificacaoPortal } from '@/components/portal/IdentificacaoPortal'
import { dataBR } from '@/lib/formato'
import { sessaoRecusada } from '@/lib/invocarFuncao'
import { usePortalSessao } from '@/hooks/usePortalIdentidade'
import { usePausaEstado, useSolicitarPausa } from '@/hooks/usePortalPausa'

// ─────────────────────────────────────────────────────────────────────────────
// Portal público de pausa (/pausa). A entrada é a de todos os portais do
// professor (código no e-mail oficial — ver IdentificacaoPortal); daqui pra
// frente o servidor sabe quem é pela sessão.
// ─────────────────────────────────────────────────────────────────────────────

type Tela = 'identificacao' | 'carregando' | 'erro' | 'ja-solicitado' | 'formulario' | 'confirmacao'

export function Home() {
  const { token, entrar, sair, invalidar } = usePortalSessao()
  const estado    = usePausaEstado(token)
  const solicitar = useSolicitarPausa()

  const [form, setForm] = useState({ motivo: '', dataInicio: '', dataFim: '', erro: '' })
  const [confirmada, setConfirmada] = useState<{ dataInicio: string; dataFim: string } | null>(null)

  if (token && estado.isError && sessaoRecusada(estado.error)) invalidar()

  const nome = estado.data?.professor.nome ?? ''
  const tela: Tela = !token ? 'identificacao'
    : confirmada ? 'confirmacao'
    : estado.isLoading ? 'carregando'
    : !estado.data ? 'erro'
    : estado.data.pausaAberta || estado.data.jaPausado ? 'ja-solicitado'
    : 'formulario'

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return

    if (form.motivo.trim().length < 5) {
      setForm({ ...form, erro: 'Conte o motivo da pausa com um pouco mais de detalhe.' })
      return
    }
    if (!form.dataInicio || !form.dataFim) {
      setForm({ ...form, erro: 'Preencha as duas datas.' })
      return
    }
    if (form.dataFim < form.dataInicio) {
      setForm({ ...form, erro: 'A data de fim não pode ser anterior à data de início.' })
      return
    }

    try {
      await solicitar.mutateAsync({
        token,
        motivo: form.motivo.trim(),
        dataInicio: form.dataInicio,
        dataFim: form.dataFim,
      })
      setConfirmada({ dataInicio: form.dataInicio, dataFim: form.dataFim })
    } catch (err) {
      if (sessaoRecusada(err)) { invalidar(); return }
      setForm({ ...form, erro: err instanceof Error ? err.message : 'Não foi possível registrar agora. Tente novamente.' })
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-surface-app flex items-center justify-center p-6">
      <FundoPortal />

      <div className="relative z-10 flex items-center justify-center w-full">
        {tela === 'identificacao' && (
          <IdentificacaoPortal
            icone={PauseCircle}
            titulo="Solicitação de Pausa"
            descricao="Informe seu e-mail cadastrado para oficializar sua pausa com a coordenação."
            onEntrar={entrar}
          />
        )}

        {tela === 'carregando' && (
          <p className="text-[13px] text-ink-muted">Carregando…</p>
        )}

        {tela === 'erro' && (
          <div className="w-full max-w-sm space-y-4 text-center">
            <AvisoErro>Não foi possível carregar seus dados agora. Recarregue a página em instantes.</AvisoErro>
          </div>
        )}

        {tela === 'ja-solicitado' && estado.data && (
          <div className="w-full max-w-sm space-y-6 text-center animate-fade-up">
            <div className="flex flex-col items-center gap-3.5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accentBlue-soft text-accentBlue shadow-inner-top">
                <CalendarClock className="h-6 w-6" />
              </span>
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  {estado.data.jaPausado ? 'Você já está em pausa' : 'Sua solicitação já está com a gente'}
                </h1>
                <p className="text-[13.5px] text-ink-muted leading-relaxed">
                  {estado.data.jaPausado
                    ? 'Seu cadastro já consta como pausado. Para encerrar a pausa ou ajustar as datas, fale com a coordenação.'
                    : 'Já existe uma solicitação de pausa em andamento no seu nome. A coordenação vai entrar em contato — não precisa preencher de novo.'}
                </p>
              </div>
            </div>
            <BotaoWhatsApp />
          </div>
        )}

        {tela === 'formulario' && (
          <div className="w-full max-w-md space-y-6 animate-fade-up">
            <div className="flex flex-col items-center gap-3.5 text-center">
              <AvatarPortal nome={nome} />
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Oficializar pausa
                </h1>
                <p className="text-[13px] text-ink-muted">
                  {nome}
                </p>
              </div>
            </div>

            <CartaoPortal>
              <form onSubmit={handleEnviar} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="motivo" className="text-[12px] text-ink-secondary font-medium">
                    Motivo da pausa
                  </Label>
                  <textarea
                    id="motivo"
                    value={form.motivo}
                    onChange={ev => setForm({ ...form, motivo: ev.target.value })}
                    required
                    rows={3}
                    placeholder="Conte brevemente o motivo da sua pausa"
                    className="w-full resize-none rounded-xl border border-line-soft bg-surface-subtle px-3 py-2
                               text-[13px] text-ink placeholder:text-ink-subtle transition-colors
                               focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="data-inicio" className="text-[12px] text-ink-secondary font-medium">
                    Início da pausa
                  </Label>
                  <Input
                    id="data-inicio"
                    type="date"
                    value={form.dataInicio}
                    onChange={ev => setForm({ ...form, dataInicio: ev.target.value })}
                    required
                    className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
                  />
                  <p className="text-[11.5px] text-ink-muted">
                    O dia em que você para de dar aulas — ou seja, seu <strong>último dia de aula</strong>.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="data-fim" className="text-[12px] text-ink-secondary font-medium">
                    Fim previsto da pausa
                  </Label>
                  <Input
                    id="data-fim"
                    type="date"
                    value={form.dataFim}
                    min={form.dataInicio || undefined}
                    onChange={ev => setForm({ ...form, dataFim: ev.target.value })}
                    required
                    className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
                  />
                  <p className="text-[11.5px] text-ink-muted">
                    O dia em que a coordenação deve te procurar. A pausa só encerra oficialmente depois desse contato.
                  </p>
                </div>

                {form.erro && <AvisoErro>{form.erro}</AvisoErro>}

                <BotaoPrimario pending={solicitar.isPending} pendingLabel="Enviando…">
                  Enviar solicitação
                </BotaoPrimario>

                <button
                  type="button"
                  onClick={() => void sair()}
                  className="btn-press w-full text-[12px] text-ink-muted hover:text-ink-secondary"
                >
                  Não sou eu
                </button>
              </form>
            </CartaoPortal>
          </div>
        )}

        {tela === 'confirmacao' && confirmada && (
          <div className="w-full max-w-sm space-y-6 text-center animate-fade-up">
            <div className="flex flex-col items-center gap-3.5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-urg-lowBg text-urg-lowFg shadow-inner-top">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Pausa registrada!
                </h1>
                <p className="text-[13.5px] text-ink-muted leading-relaxed">
                  Recebemos sua solicitação, {nome.split(' ')[0]}. A coordenação vai processar
                  a retirada dos seus alunos antes do início.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-line-soft bg-surface-canvas px-5 py-4 space-y-2 text-left">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink-muted">Último dia de aula</span>
                <span className="font-medium text-ink tabular-nums">{dataBR(confirmada.dataInicio)}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink-muted">Fim previsto</span>
                <span className="font-medium text-ink tabular-nums">{dataBR(confirmada.dataFim)}</span>
              </div>
            </div>

            <p className="text-[12px] text-ink-muted leading-relaxed">
              Sua pausa só encerra depois do contato da coordenação, a partir da data de fim.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
