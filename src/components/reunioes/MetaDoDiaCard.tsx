import { useMemo, useState } from 'react'
import {
  Target, Check, Mail, Copy, Phone, MessageCircle, Loader2, Sparkles, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { useSugestoesReuniao, type SugestaoContato } from '@/hooks/useSugestoesReuniao'
import { useEnviarEmailMassa } from '@/hooks/useEnviarEmailMassa'
import {
  montarCorpoConvocacao, ASSUNTO_CONVOCACAO_PADRAO, type AlvoEmail,
} from '@/lib/convocacaoEmail'
import { metaDoDia, sugestoesNecessarias, SUGESTOES_POR_FALTA } from '@/lib/metaReunioes'
import { cn, whatsappLink } from '@/lib/utils'
import { toast } from 'sonner'

// ─────────────────────────────────────────────────────────────────────────────
// "O dia está de pé?" — contador de reuniões do dia contra a meta, e, quando
// falta, a lista de quem chamar para fechar o buraco AINDA HOJE.
//
// Fica só na visão de Dia: é uma ferramenta de execução do dia corrente, não um
// relatório. Em dia passado o bloco vira só o placar (não há o que contatar).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  dia: Date
  coordenadorId: string
  /** Reuniões com professor marcadas para o dia (1:1, grupo e feedback coletivo). */
  agendadas: number
  /** Quantas dessas já foram lançadas como realizadas. */
  realizadas: number
  /** Professores que já têm reunião nesse dia — não entram nas sugestões. */
  idsDoDia: Set<string>
}

function ehHojeOuDepois(d: Date): boolean {
  const hoje = new Date()
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const b = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()
  return a >= b
}

async function copiar(texto: string, oQue: string) {
  try {
    await navigator.clipboard.writeText(texto)
    toast.success(`${oQue} copiado.`)
  } catch {
    toast.error(`Não foi possível copiar ${oQue.toLowerCase()}.`)
  }
}

export function MetaDoDiaCard({ dia, coordenadorId, agendadas, realizadas, idsDoDia }: Props) {
  const { profile } = useAuth()
  const meta = metaDoDia(dia)
  const faltam = Math.max(0, meta - agendadas)
  const futuro = ehHojeOuDepois(dia)

  // Quantos nomes mostrar. Começa no dobro do buraco e cresce sob demanda —
  // quem já mandou mensagem para os seis e não fechou pede mais seis.
  const [extras, setExtras] = useState(0)
  const alvoSugestoes = sugestoesNecessarias(faltam) + extras

  const precisaSugerir = futuro && alvoSugestoes > 0
  const { data: candidatos = [], isLoading } = useSugestoesReuniao(precisaSugerir ? coordenadorId : null)

  const sugestoes = useMemo(
    () => candidatos.filter(c => !idsDoDia.has(c.professor_id)).slice(0, alvoSugestoes),
    [candidatos, idsDoDia, alvoSugestoes],
  )

  const pct = meta > 0 ? Math.min(100, Math.round((agendadas / meta) * 100)) : 0
  const bateu = meta > 0 && agendadas >= meta

  return (
    <div className="card-surface overflow-hidden max-w-[640px]">
      {/* Placar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg',
            meta === 0 ? 'bg-surface-subtle text-ink-muted'
              : bateu ? 'bg-urg-lowBg text-urg-lowFg'
              : 'bg-urg-medBg text-urg-medFg',
          )}>
            {bateu ? <Check className="h-4 w-4" /> : <Target className="h-4 w-4" />}
          </span>
          <div className="space-y-0.5">
            <p className="text-[13px] font-semibold text-ink">
              <span className="tabular-nums text-[17px]">{agendadas}</span>
              <span className="text-ink-muted"> de {meta} </span>
              {meta === 1 ? 'reunião' : 'reuniões'}
              <span className="text-ink-muted"> no dia</span>
            </p>
            <p className="text-[11.5px] text-ink-muted">
              {meta === 0
                ? 'Fim de semana — sem meta de reuniões.'
                : bateu
                ? `Meta do dia batida. ${realizadas} já ${realizadas === 1 ? 'lançada' : 'lançadas'}.`
                : `Faltam ${faltam} para bater a meta · ${realizadas} já ${realizadas === 1 ? 'lançada' : 'lançadas'}.`}
            </p>
          </div>
        </div>

        {meta > 0 && (
          <div className="flex w-full items-center gap-2 sm:w-40">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-subtle">
              <div
                className={cn('h-full rounded-full transition-all', bateu ? 'bg-urg-lowFg' : 'bg-urg-medFg')}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] font-medium tabular-nums text-ink-muted">{pct}%</span>
          </div>
        )}
      </div>

      {/* Sugestões */}
      {precisaSugerir && (
        <div className="border-t border-line-soft bg-surface-subtle/30 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
              <Sparkles className="h-3.5 w-3.5 text-accentBlue" />
              {faltam > 0
                ? `${alvoSugestoes} professores para contatar e fechar as ${faltam} que faltam`
                : `${alvoSugestoes} professores para contatar`}
            </p>
            <p className="text-[11px] text-ink-muted">
              {SUGESTOES_POR_FALTA}× o buraco, de quem mais precisa de reunião
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-subtle" />)}
            </div>
          ) : sugestoes.length === 0 ? (
            <p className="py-3 text-center text-[12px] text-ink-muted">
              Nenhum professor deste coordenador está sem reunião no momento.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line bg-surface-canvas">
                {sugestoes.map(s => <LinhaSugestao key={s.professor_id} sugestao={s} podeEnviar={canEdit(profile) || profile?.is_lider === true} assinatura={profile?.nome ?? ''} />)}
              </ul>
              {candidatos.length > sugestoes.length && (
                <button
                  onClick={() => setExtras(e => e + SUGESTOES_POR_FALTA)}
                  className="btn-press inline-flex items-center gap-1.5 text-[11.5px] font-medium text-accentBlue hover:opacity-80"
                >
                  <RefreshCw className="h-3 w-3" />
                  Sugerir mais {SUGESTOES_POR_FALTA}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Linha de um professor sugerido ──────────────────────────────────────────

function LinhaSugestao({ sugestao, podeEnviar, assinatura }: {
  sugestao: SugestaoContato
  podeEnviar: boolean
  assinatura: string
}) {
  const enviar = useEnviarEmailMassa()
  const [enviado, setEnviado] = useState(false)
  const wa = whatsappLink(sugestao.telefone)

  function convidar() {
    const alvo: AlvoEmail = {
      nome: sugestao.nome,
      coordenador_nome: sugestao.coordenador_nome,
      grupo_nome: sugestao.grupo_nome,
      data_ultima_reuniao: sugestao.data_ultima_reuniao,
      elegivel_alocacao: sugestao.elegivel_alocacao,
      aulas_pendentes_qtd: sugestao.aulas_pendentes_qtd,
    }
    enviar.mutate({
      assunto: ASSUNTO_CONVOCACAO_PADRAO,
      tipo: 'convocacao',
      remetente_nome: assinatura || 'Coordenação',
      mensagens: [{
        professor_id: sugestao.professor_id,
        corpo: montarCorpoConvocacao(alvo, { assinatura, comoCoordenador: false, incluirLink: true }),
      }],
    }, {
      onSuccess: r => {
        const res = r.resultados[0]
        if (res?.status === 'enviado') {
          setEnviado(true)
          toast.success(`Convite enviado para ${res.email}.`)
        } else if (res?.status === 'sem_email') {
          toast.error('Este professor não tem e-mail no cadastro.')
        } else {
          toast.error(res?.erro ?? 'Falha no envio.')
        }
      },
      onError: e => toast.error(e instanceof Error ? e.message : 'Falha no envio.'),
    })
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] font-medium text-ink">{sugestao.nome}</span>
          <button
            onClick={() => copiar(sugestao.nome, 'Nome')}
            title="Copiar nome"
            className="btn-press rounded p-0.5 text-ink-subtle transition-colors hover:bg-surface-subtle hover:text-ink-secondary"
          >
            <Copy className="h-3 w-3" />
          </button>
          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', sugestao.nivel.tagClass)}>
            {sugestao.nivel.label}
          </span>
        </div>
        <p className="truncate text-[11px] text-ink-muted">{sugestao.sinais.join(' · ')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {sugestao.telefone ? (
          <>
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-subtle px-2 py-1 text-[11px] tabular-nums text-ink-secondary">
              <Phone className="h-3 w-3 text-ink-subtle" />
              {sugestao.telefone}
            </span>
            <button
              onClick={() => copiar(sugestao.telefone!, 'Número')}
              title="Copiar número"
              className="btn-press rounded-md border border-line p-1.5 text-ink-secondary transition-colors hover:text-ink"
            >
              <Copy className="h-3 w-3" />
            </button>
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                title="Abrir conversa no WhatsApp"
                className="btn-press rounded-md border border-line p-1.5 text-ink-secondary transition-colors hover:text-ink"
              >
                <MessageCircle className="h-3 w-3" />
              </a>
            )}
          </>
        ) : (
          <span className="text-[11px] text-ink-subtle">sem telefone</span>
        )}

        <Button
          size="sm"
          variant="outline"
          disabled={!podeEnviar || !sugestao.email || enviar.isPending || enviado}
          onClick={convidar}
          title={!sugestao.email
            ? 'Professor sem e-mail no cadastro'
            : !podeEnviar
            ? 'Seu cargo não dispara e-mails'
            : 'Enviar o convite padrão de reunião'}
          className="btn-press h-7 gap-1.5 border-line text-[11px] text-ink-secondary hover:text-ink"
        >
          {enviar.isPending ? <Loader2 className="h-3 w-3 animate-spin" />
            : enviado ? <Check className="h-3 w-3 text-urg-lowFg" />
            : <Mail className="h-3 w-3" />}
          {enviado ? 'Enviado' : 'E-mail'}
        </Button>
      </div>
    </li>
  )
}
