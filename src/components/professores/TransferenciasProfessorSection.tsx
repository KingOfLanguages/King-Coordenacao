// ─────────────────────────────────────────────────────────────────────────────
// Pedidos de transferência de aluno no perfil do professor.
//
// Existe separada da linha do tempo de observações (que já recebe uma entrada
// por pedido, via trigger) porque a leitura útil aqui é AGREGADA: o que importa
// não é cada pedido isolado, e sim o padrão — quantos pedidos, com que
// frequência, e quantos de fato viraram transferência.
//
// Um professor com dois pedidos por ano é rotina. Um com seis em três meses é
// uma conversa que a coordenação precisa ter.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { UserCog, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { useTransferenciasDoProfessor, diasDesde } from '@/hooks/useTransferencias'
import {
  motivoTransferenciaLabel, desfechoMeta, tempoDeVinculo, diasUteisLabel,
  STATUS_TRANSFERENCIA_META,
} from '@/lib/transferenciaLabels'
import { dataBR } from '@/lib/formato'
import { AlunoId } from '@/components/alunos/AlunoId'
import { cn } from '@/lib/utils'

/** Janela usada para dizer se os pedidos estão concentrados no tempo. */
const JANELA_DIAS = 90
/** A partir de quantos pedidos na janela o padrão merece destaque. */
const LIMITE_PADRAO = 3

export function TransferenciasProfessorSection({ professorId }: { professorId: string }) {
  const { data: pedidos = [], isLoading } = useTransferenciasDoProfessor(professorId)
  const [expandido, setExpandido] = useState<Set<string>>(new Set())

  const resumo = useMemo(() => {
    const recentes = pedidos.filter(p => diasDesde(p.created_at) <= JANELA_DIAS).length
    const transferidos = pedidos.filter(p => p.desfecho === 'transferido').length
    const mantidos = pedidos.filter(p => p.desfecho === 'mantido').length
    const abertos = pedidos.filter(p => p.status === 'pendente' || p.status === 'em_atendimento').length
    // Pedidos abaixo dos 7 dias úteis — cada um destes já virou informe negativo.
    const foraDoPrazo = pedidos.filter(p => p.snapshot?.dentro_do_prazo === false).length
    return { recentes, transferidos, mantidos, abertos, foraDoPrazo }
  }, [pedidos])

  // Nada a mostrar: some da tela em vez de ocupar espaço com um vazio.
  if (isLoading || pedidos.length === 0) return null

  const padrao = resumo.recentes >= LIMITE_PADRAO

  function toggle(id: string) {
    setExpandido(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="card-surface space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <UserCog className="h-3.5 w-3.5 text-ink-muted" />
        <h2 className="label-micro">Transferências de aluno ({pedidos.length})</h2>
        {resumo.abertos > 0 && (
          <span className="rounded-full bg-urg-medBg px-2 py-0.5 text-[10.5px] font-medium text-urg-medFg">
            {resumo.abertos} em aberto
          </span>
        )}
      </div>

      {padrao && (
        <p className="flex items-start gap-1.5 rounded-lg bg-urg-medBg px-3 py-2 text-[12px] font-medium text-urg-medFg">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {resumo.recentes} pedidos nos últimos {JANELA_DIAS} dias — vale entender o que se repete.
        </p>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line-soft sm:grid-cols-5">
        <Metrica rotulo={`Últimos ${JANELA_DIAS} d`} valor={resumo.recentes} alerta={padrao} />
        <Metrica rotulo="Fora do prazo" valor={resumo.foraDoPrazo} alerta={resumo.foraDoPrazo > 0} />
        <Metrica rotulo="Transferidos" valor={resumo.transferidos} />
        <Metrica rotulo="Mantidos" valor={resumo.mantidos} />
        <Metrica rotulo="Total" valor={pedidos.length} />
      </div>

      <ul className="divide-y divide-line-soft">
        {pedidos.map(p => {
          const aberto = expandido.has(p.id)
          const statusMeta = STATUS_TRANSFERENCIA_META[p.status]
          const desfecho = desfechoMeta(p.desfecho)
          const tempo = tempoDeVinculo(p.snapshot?.aluno_dias_com_professor)
          return (
            <li key={p.id}>
              <button
                onClick={() => toggle(p.id)}
                className="btn-press flex w-full items-center gap-2 py-2 text-left"
              >
                {aberto
                  ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                  : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" />}
                <span className="w-[4.6rem] shrink-0 tabular-nums text-[11.5px] text-ink-muted">
                  {dataBR(p.created_at)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                  {p.aluno_nome}
                  <AlunoId id={p.aluno_id} className="ml-1.5 text-[10.5px] font-normal" />
                </span>
                <span className="hidden truncate text-[11.5px] text-ink-secondary sm:block">
                  {motivoTransferenciaLabel(p.motivo)}
                </span>
                <span className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium',
                  desfecho?.cls ?? statusMeta.cls,
                )}>
                  {desfecho?.label ?? statusMeta.label}
                </span>
              </button>

              {aberto && (
                <div className="space-y-2 pb-3 pl-[1.4rem] text-[12px]">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-muted">
                    <span>Motivo: <span className="text-ink-secondary">{motivoTransferenciaLabel(p.motivo)}</span></span>
                    <span>Última aula: <span className="text-ink-secondary tabular-nums">{dataBR(p.data_ultima_aula)}</span></span>
                    {p.snapshot?.prazo_dias_uteis != null && (
                      <span className={cn(p.snapshot.dentro_do_prazo === false && 'font-medium text-urg-highFg')}>
                        avisou com {diasUteisLabel(p.snapshot.prazo_dias_uteis)}
                        {p.snapshot.dentro_do_prazo === false && ' — fora do prazo'}
                      </span>
                    )}
                    {tempo && <span>Aluno estava com ele {tempo}</span>}
                    {!p.aluno_da_lista && <span className="font-medium text-urg-medFg">nome digitado</span>}
                  </div>

                  <p className="rounded-lg bg-surface-subtle/60 px-3 py-2 leading-relaxed text-ink-secondary">
                    {p.detalhe}
                  </p>

                  {p.desfecho_nota && (
                    <p className="text-[11.5px] text-ink-muted">
                      Nota do atendimento: <span className="text-ink-secondary">{p.desfecho_nota}</span>
                    </p>
                  )}
                  {p.motivo_recusa && (
                    <p className="text-[11.5px] text-ink-muted">
                      Motivo da recusa: <span className="text-ink-secondary">{p.motivo_recusa}</span>
                    </p>
                  )}
                  {p.destino?.nome && (
                    <p className="text-[11.5px] text-ink-muted">
                      Transferido para <span className="font-medium text-ink-secondary">{p.destino.nome}</span>
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Metrica({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="bg-surface-canvas px-3 py-2">
      <p className="text-[10.5px] text-ink-muted">{rotulo}</p>
      <p className={cn(
        'text-[15px] font-semibold tabular-nums',
        alerta ? 'text-urg-medFg' : 'text-ink',
      )}>
        {valor}
      </p>
    </div>
  )
}
