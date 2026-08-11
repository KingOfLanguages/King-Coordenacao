// ─────────────────────────────────────────────────────────────────────────────
// Dossiê do aluno de um pedido de transferência.
//
// O desafio que esta tela resolve: quem atende precisa decidir se transfere,
// medeia ou recusa — e essa decisão depende de coisas que estão espalhadas em
// quatro lugares diferentes do banco. Aqui elas aparecem juntas:
//
//   vínculo      → há quanto tempo o aluno está com ESTE professor
//   saídas       → quantas vezes ele já trocou de professor (qualquer professor)
//   pedidos      → esse aluno já foi pedido pra transferência antes?
//   ocorrências  → o aluno aparece em incidentes registrados pelo professor?
//   professor    → esse pedido é isolado ou é um padrão de quem pediu?
//
// Tudo vem de UMA rpc (transferencia_dossie). Quando o vínculo já sumiu do
// roster — o que acontece assim que a transferência é efetivada na plataforma
// do King — a tela cai no snapshot congelado no momento do pedido, e diz isso.
// ─────────────────────────────────────────────────────────────────────────────

import {
  History, Users, FileWarning, Repeat, TrendingUp, CalendarDays, Camera,
} from 'lucide-react'
import { useTransferenciaDossie, type Dossie } from '@/hooks/useTransferencias'
import {
  motivoTransferenciaLabel, statusAlunoLabel, tempoDeVinculo, desfechoMeta,
} from '@/lib/transferenciaLabels'
import { motivoSaidaLabel } from '@/lib/cicloVida'
import { urgenciaChip } from '@/lib/nexusLabels'
import { dataBR } from '@/lib/formato'
import { cn } from '@/lib/utils'
import type { TransferenciaSnapshot } from '@/types'

export function DossieAluno({
  transferenciaId, snapshot, alunoDaLista,
}: {
  transferenciaId: string
  snapshot: TransferenciaSnapshot | null
  alunoDaLista: boolean
}) {
  const { data: dossie, isLoading, isError } = useTransferenciaDossie(transferenciaId)

  if (isLoading) {
    return <p className="py-4 text-center text-[12px] text-ink-muted">Carregando dossiê…</p>
  }
  if (isError || !dossie) {
    return (
      <p className="py-4 text-center text-[12px] text-ink-muted">
        Não foi possível carregar o dossiê agora.
      </p>
    )
  }

  return (
    <div className="space-y-4 border-t border-line-soft pt-3">
      <VinculoAtual dossie={dossie} snapshot={snapshot} alunoDaLista={alunoDaLista} />
      <HistoricoSaidas dossie={dossie} />
      <PedidosAnteriores dossie={dossie} />
      <Ocorrencias dossie={dossie} />
      <ContextoProfessor dossie={dossie} />
    </div>
  )
}

// ─── Bloco: vínculo atual ────────────────────────────────────────────────────

function VinculoAtual({
  dossie, snapshot, alunoDaLista,
}: { dossie: Dossie; snapshot: TransferenciaSnapshot | null; alunoDaLista: boolean }) {
  const v = dossie.vinculo

  // Quando o vínculo não está mais no roster, o snapshot é a única fonte —
  // e é exatamente o cenário de "a transferência já foi feita na plataforma".
  const dias      = v?.dias_com_professor ?? snapshot?.aluno_dias_com_professor ?? null
  const entrada   = v?.data_adicao ?? snapshot?.aluno_data_adicao ?? null
  const matricula = v?.data_matricula_escola ?? snapshot?.aluno_data_matricula_escola ?? null
  const status    = v?.status_aluno ?? snapshot?.aluno_status ?? null
  const congelado = !v

  return (
    <Bloco icone={Users} titulo="Vínculo com este professor">
      {congelado && (
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-surface-subtle px-2 py-1 text-[11px] text-ink-muted">
          <Camera className="h-3 w-3" />
          {alunoDaLista
            ? 'O vínculo não está mais no cadastro — dados congelados no momento do pedido.'
            : 'Pedido sem aluno da lista: sem vínculo para consultar.'}
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        <Dado rotulo="Tempo com o professor" valor={tempoDeVinculo(dias) ?? '—'} destaque />
        <Dado rotulo="Entrou na agenda" valor={entrada ? dataBR(entrada) : '—'} />
        <Dado rotulo="Matrícula na escola" valor={matricula ? dataBR(matricula) : '—'} />
        <Dado rotulo="Status do aluno" valor={statusAlunoLabel(status)} />
      </div>
    </Bloco>
  )
}

// ─── Bloco: histórico de saídas do aluno ─────────────────────────────────────

function HistoricoSaidas({ dossie }: { dossie: Dossie }) {
  const saidas = dossie.saidas ?? []
  const trocas = saidas.filter(s => s.saiu_da_escola === false).length

  return (
    <Bloco
      icone={Repeat}
      titulo="Histórico do aluno"
      contador={saidas.length}
      alerta={trocas >= 2}
    >
      {saidas.length === 0 ? (
        <p className="text-[12px] text-ink-muted">
          Nenhuma saída registrada. É o primeiro professor do aluno (ou o histórico
          começou depois dele).
        </p>
      ) : (
        <>
          {trocas >= 2 && (
            <p className="mb-2 rounded-md bg-urg-medBg px-2.5 py-1.5 text-[11.5px] font-medium text-urg-medFg">
              Este aluno já trocou de professor {trocas} vezes. Vale entender o que se repete
              antes de mover de novo.
            </p>
          )}
          <ul className="divide-y divide-line-soft">
            {saidas.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-[12px]">
                <span className="tabular-nums text-ink-muted">{dataBR(s.data_saida)}</span>
                <span className="font-medium text-ink">{s.professor_nome ?? 'Professor removido'}</span>
                <span className="text-ink-secondary">· {motivoSaidaLabel(s.motivo_saida)}</span>
                <span className={cn(
                  'ml-auto rounded-full px-1.5 py-0.5 text-[10.5px] font-medium',
                  s.saiu_da_escola
                    ? 'bg-urg-highBg text-urg-highFg'
                    : 'bg-accentBlue-soft text-accentBlue',
                )}>
                  {s.saiu_da_escola ? 'saiu da escola' : 'trocou de professor'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Bloco>
  )
}

// ─── Bloco: pedidos anteriores para o mesmo aluno ────────────────────────────

function PedidosAnteriores({ dossie }: { dossie: Dossie }) {
  const pedidos = dossie.pedidos_anteriores ?? []
  if (pedidos.length === 0) return null

  return (
    <Bloco icone={History} titulo="Outros pedidos para este aluno" contador={pedidos.length} alerta>
      <ul className="divide-y divide-line-soft">
        {pedidos.map(p => {
          const meta = desfechoMeta(p.desfecho)
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-[12px]">
              <span className="tabular-nums text-ink-muted">{dataBR(p.created_at)}</span>
              <span className="font-medium text-ink">{p.professor_nome ?? 'Professor removido'}</span>
              <span className="text-ink-secondary">· {motivoTransferenciaLabel(p.motivo)}</span>
              {meta && (
                <span className={cn('ml-auto rounded-full px-1.5 py-0.5 text-[10.5px] font-medium', meta.cls)}>
                  {meta.label}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </Bloco>
  )
}

// ─── Bloco: ocorrências que citam o aluno ────────────────────────────────────

function Ocorrencias({ dossie }: { dossie: Dossie }) {
  const ocorrencias = dossie.ocorrencias ?? []
  if (ocorrencias.length === 0) return null

  return (
    <Bloco icone={FileWarning} titulo="Ocorrências que citam o aluno" contador={ocorrencias.length}>
      <p className="mb-2 text-[11px] text-ink-muted">
        Casamento aproximado por nome, entre os incidentes deste professor — pode haver homônimo.
      </p>
      <ul className="divide-y divide-line-soft">
        {ocorrencias.map(o => (
          <li key={o.id} className="py-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
              <span className="tabular-nums text-ink-muted">{dataBR(o.created_at)}</span>
              <span className="font-medium text-ink">{o.problem_type}</span>
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[10.5px] font-medium',
                urgenciaChip[o.urgency] ?? 'bg-surface-subtle text-ink-secondary',
              )}>
                {o.urgency}
              </span>
              <span className={cn(
                'ml-auto rounded-full px-1.5 py-0.5 text-[10.5px] font-medium',
                o.resolved ? 'bg-urg-lowBg text-urg-lowFg' : 'bg-urg-medBg text-urg-medFg',
              )}>
                {o.resolved ? 'concluído' : 'em aberto'}
              </span>
            </div>
            {o.description && (
              <p className="mt-0.5 line-clamp-2 text-[11.5px] text-ink-secondary">{o.description}</p>
            )}
          </li>
        ))}
      </ul>
    </Bloco>
  )
}

// ─── Bloco: contexto do professor que pediu ──────────────────────────────────

function ContextoProfessor({ dossie }: { dossie: Dossie }) {
  const p = dossie.professor
  if (!p) return null

  // Um pedido isolado é rotina; vários em 90 dias é conversa com o coordenador.
  const padrao = p.pedidos_90d >= 3

  return (
    <Bloco icone={TrendingUp} titulo="Contexto do professor" alerta={padrao}>
      {padrao && (
        <p className="mb-2 rounded-md bg-urg-medBg px-2.5 py-1.5 text-[11.5px] font-medium text-urg-medFg">
          {p.pedidos_90d} pedidos de transferência nos últimos 90 dias. Vale acionar a coordenação.
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        <Dado rotulo="Alunos na agenda" valor={String(p.qtd_alunos)} />
        <Dado rotulo="Pedidos (90 dias)" valor={String(p.pedidos_90d)} destaque={padrao} />
        <Dado rotulo="Pedidos (total)" valor={String(p.pedidos_total)} />
        <Dado rotulo="Saídas de aluno (90 d)" valor={String(p.saidas_90d)} />
      </div>
    </Bloco>
  )
}

// ─── Peças ───────────────────────────────────────────────────────────────────

function Bloco({
  icone: Icone, titulo, contador, alerta, children,
}: {
  icone: typeof Users
  titulo: string
  contador?: number
  alerta?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icone className={cn('h-3.5 w-3.5', alerta ? 'text-urg-medFg' : 'text-ink-muted')} />
        <h4 className={cn(
          'text-[11px] font-semibold uppercase tracking-wide',
          alerta ? 'text-urg-medFg' : 'text-ink-secondary',
        )}>
          {titulo}
          {contador !== undefined && <span className="ml-1 tabular-nums font-normal">({contador})</span>}
        </h4>
      </div>
      <div className="rounded-lg bg-surface-subtle/60 px-3 py-2.5">{children}</div>
    </section>
  )
}

function Dado({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] text-ink-muted">{rotulo}</p>
      <p className={cn(
        'truncate text-[12.5px] font-medium tabular-nums',
        destaque ? 'text-urg-medFg' : 'text-ink',
      )}>
        {valor}
      </p>
    </div>
  )
}

/** Linha compacta com data + rótulo — usada quando só o "quando" importa. */
export function LinhaData({ data, texto }: { data: string; texto: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
      <CalendarDays className="h-3 w-3" />
      <span className="tabular-nums">{dataBR(data)}</span>
      <span>{texto}</span>
    </p>
  )
}
