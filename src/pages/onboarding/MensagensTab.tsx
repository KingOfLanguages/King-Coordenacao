// ─────────────────────────────────────────────────────────────────────────────
// Aba "Mensagens" do Onboarding: o checklist da coordenação marcando quais
// mensagens de boas-vindas já foram enviadas em cada um dos 7 primeiros dias.
//
// Era a página /onboarding inteira até o Welcome Path entrar; virou aba quando
// o mesmo professor recém-chegado passou a ter dois acompanhamentos (mensagens
// enviadas E trilha percorrida).
//
// Os 7 dias são dias ÚTEIS (ver lib/diasUteis) — quem começa numa sexta está no
// Dia 2 na segunda, e ninguém aparece atrasado por causa do fim de semana.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { Search, UserPlus, Trash2, Check, Tag as TagIcon, StickyNote, CalendarClock, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { diaUtilDeOnboarding, parseISODate } from '@/lib/diasUteis'
import { TAG_CORES, TAG_COR_PADRAO, corDaTag, type TagCorId } from '@/lib/tagsOnboarding'
import { useProfessores } from '@/hooks/useProfessores'
import {
  useOnboarding, useAtualizarDiasOnboarding, useDefinirTelefone,
  useAdicionarOnboarding, useRemoverOnboarding, useAtualizarTagOnboarding,
  useExcluirTagOnboarding, useConfirmarMudancaInicio,
  type OnboardingRow, type StatusDia,
} from '@/hooks/useOnboarding'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Nº do dia de onboarding em dias úteis (Dia 1 = primeiro dia útil de casa). */
const diaOnboarding = diaUtilDeOnboarding

function fmtData(iso: string | null): string {
  const d = parseISODate(iso)
  return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

// ─── Estado do acompanhamento (baseado no que foi enviado) ────────────────────

function enviados(dias: StatusDia[]): number {
  return dias.filter(d => d === 2).length
}

/** Concluído = os 7 dias enviados. SÓ então o professor sai da lista ativa. */
function concluido(dias: StatusDia[]): boolean {
  return dias.length === 7 && dias.every(d => d === 2)
}

/** Tem algum dia útil já vencido (anterior a hoje) que não foi enviado. */
function temAtraso(dias: StatusDia[], dataInicio: string | null): boolean {
  const n = diaOnboarding(dataInicio)
  if (n == null || n < 2) return false
  const vencidos = Math.min(n - 1, 7) // dias 1..(n-1) já deveriam estar enviados
  for (let i = 0; i < vencidos; i++) if (dias[i] !== 2) return true
  return false
}

// ─── Chip de situação do acompanhamento ───────────────────────────────────────

function SituacaoChip({ dias, dataInicio }: { dias: StatusDia[]; dataInicio: string | null }) {
  const env = enviados(dias)
  const n = diaOnboarding(dataInicio)
  let cls: string
  let label: string

  if (concluido(dias)) {
    cls = 'bg-urg-lowBg text-urg-lowFg'; label = 'Concluído'
  } else if (n != null && n <= 0) {
    cls = 'bg-accentBlue-soft text-accentBlue'; label = `Começa em ${1 - n}d`
  } else if (temAtraso(dias, dataInicio)) {
    cls = 'bg-urg-highBg text-urg-highFg'; label = `${env}/7 · atrasado`
  } else {
    cls = 'bg-urg-medBg text-urg-medFg'
    label = n != null && n >= 1 && n <= 7 ? `${env}/7 · Dia ${n}` : `${env}/7 enviados`
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium', cls)}>
      {label}
    </span>
  )
}

// ─── Tag por registro (rótulo + cor + observação) ─────────────────────────────

// Uma tag não tem cadastro próprio no banco: ela existe enquanto alguma linha do
// acompanhamento a carrega. Por isso a sugestão anda junto com os registros que
// a usam — é o que permite reaproveitar, filtrar e, na gerência, excluir.
type Sugestao = {
  chave: string           // texto normalizado (sem acento/caixa) — identidade da tag
  texto: string           // grafia da primeira linha encontrada
  cor: string | null
  ids: string[]           // registros que carregam a tag
  emAndamento: number     // quantos deles ainda não concluíram os 7 dias
}

function TagChip({ texto, cor, className }: { texto: string; cor: string | null; className?: string }) {
  const c = corDaTag(cor)
  return (
    <span
      className={cn('inline-flex max-w-[150px] items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium', className)}
      style={{ backgroundColor: c.bg, color: c.fg }}
      title={texto}
    >
      <span className="truncate">{texto}</span>
    </span>
  )
}

/** Botão-tag ao lado do nome: mostra a tag atual (ou "tag") e abre o editor. */
function TagDoRegistro({ row, sugestoes }: { row: OnboardingRow; sugestoes: Sugestao[] }) {
  const salvar = useAtualizarTagOnboarding()
  const [open, setOpen] = useState(false)

  const [texto, setTexto] = useState(row.tag_texto ?? '')
  const [cor, setCor] = useState<TagCorId>((corDaTag(row.tag_cor).id))
  const [obs, setObs] = useState(row.observacao ?? '')

  // Reabrir sempre parte do que está no servidor (outra pessoa pode ter mudado).
  function abrir(v: boolean) {
    if (v) {
      setTexto(row.tag_texto ?? '')
      setCor(row.tag_cor ? corDaTag(row.tag_cor).id : TAG_COR_PADRAO)
      setObs(row.observacao ?? '')
    }
    setOpen(v)
  }

  function commit(tag: { tag_texto: string | null; tag_cor: string | null; observacao: string | null }) {
    salvar.mutate({ id: row.id, tag }, {
      onSuccess: () => setOpen(false),
      onError:   () => toast.error('Não foi possível salvar a tag.'),
    })
  }

  const temTag = !!row.tag_texto?.trim()
  const temObs = !!row.observacao?.trim()

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <button
          type="button"
          title={temTag ? 'Editar tag' : 'Adicionar tag'}
          className="btn-press inline-flex max-w-[170px] items-center gap-1 rounded-full align-middle transition-opacity hover:opacity-80"
        >
          {temTag ? (
            <TagChip texto={row.tag_texto!.trim()} cor={row.tag_cor} />
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2 py-0.5 text-[10.5px] font-medium text-ink-subtle hover:text-ink-secondary">
              <TagIcon className="h-3 w-3" /> tag
            </span>
          )}
          {temObs && <StickyNote className="h-3 w-3 flex-shrink-0 text-ink-muted" />}
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            Tag de {row.professor?.nome ?? 'professor'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Rótulo */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Tag</label>
            <Input
              autoFocus
              value={texto}
              maxLength={28}
              onChange={e => setTexto(e.target.value)}
              placeholder="Ex.: aguardando contrato"
              className="h-9 border-line bg-surface-canvas text-[13px]"
            />
          </div>

          {/* Cor */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Cor</label>
            <div className="flex flex-wrap gap-1.5">
              {TAG_CORES.map(c => (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  onClick={() => setCor(c.id)}
                  className={cn(
                    'btn-press h-7 w-7 rounded-full border transition-all',
                    cor === c.id ? 'border-ink ring-2 ring-accentBlue/40' : 'border-line',
                  )}
                  style={{ backgroundColor: c.bg }}
                >
                  {cor === c.id && <Check className="mx-auto h-3.5 w-3.5" style={{ color: c.fg }} />}
                </button>
              ))}
            </div>
          </div>

          {/* Observação */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Observação</label>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              rows={3}
              placeholder="Anotação livre sobre este professor…"
              className="w-full resize-y rounded-lg border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-subtle focus-visible:border-accentBlue"
            />
          </div>

          {/* Prévia + reaproveitar tags já usadas */}
          {texto.trim() && (
            <div className="flex items-center gap-2 text-[11.5px] text-ink-muted">
              Prévia: <TagChip texto={texto.trim()} cor={cor} />
            </div>
          )}
          {sugestoes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Tags já usadas</p>
              <div className="flex flex-wrap gap-1.5">
                {sugestoes.map(s => (
                  <button
                    key={s.chave}
                    type="button"
                    className="btn-press"
                    onClick={() => { setTexto(s.texto); setCor(corDaTag(s.cor).id) }}
                  >
                    <TagChip texto={s.texto} cor={s.cor} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            size="sm"
            variant="ghost"
            className="text-ink-muted hover:text-urg-highFg"
            disabled={!temTag && !temObs}
            onClick={() => commit({ tag_texto: null, tag_cor: null, observacao: null })}
          >
            Limpar
          </Button>
          <Button
            size="sm"
            className="btn-press"
            disabled={salvar.isPending}
            onClick={() => commit({
              tag_texto: texto.trim() || null,
              tag_cor: texto.trim() ? cor : null,
              observacao: obs.trim() || null,
            })}
          >
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Gerência das tags (excluir o que caiu em desuso) ─────────────────────────
// Como a tag mora nos registros, ela nunca "sai" sozinha: um rótulo criado para
// uma situação pontual fica para sempre na barra de filtros e na lista de
// reaproveitamento, mesmo depois que todo mundo que o usava concluiu. Excluir
// aqui limpa o rótulo (e a cor) de todos os registros de uma vez. A observação
// de cada linha é preservada — é anotação sobre o professor, não sobre a tag.

function GerenciarTagsDialog({
  sugestoes, aoExcluir,
}: {
  sugestoes: Sugestao[]
  aoExcluir: (chave: string) => void
}) {
  const excluir = useExcluirTagOnboarding()
  const [open, setOpen] = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)

  function abrir(v: boolean) {
    if (v) setConfirmando(null)
    setOpen(v)
  }

  function remover(s: Sugestao) {
    excluir.mutate({ ids: s.ids, texto: s.texto }, {
      onSuccess: () => {
        setConfirmando(null)
        aoExcluir(s.chave)
        toast.success(`Tag "${s.texto}" excluída de ${s.ids.length} ${s.ids.length === 1 ? 'registro' : 'registros'}.`)
        if (sugestoes.length <= 1) setOpen(false)
      },
      onError: () => toast.error('Não foi possível excluir a tag.'),
    })
  }

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Gerenciar tags"
          className="btn-press inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink-secondary"
        >
          <Settings2 className="h-3 w-3" /> gerenciar
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Gerenciar tags</DialogTitle>
        </DialogHeader>

        <p className="text-[12px] text-ink-muted">
          Excluir uma tag tira o rótulo de todos os registros que a usam. As observações
          escritas em cada professor continuam onde estão.
        </p>

        <ul className="max-h-[320px] space-y-1 overflow-auto overscroll-contain">
          {sugestoes.map(s => {
            const confirma = confirmando === s.chave
            const n = s.ids.length
            return (
              <li
                key={s.chave}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors',
                  confirma ? 'bg-aviso-warnBg' : 'hover:bg-surface-subtle',
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <TagChip texto={s.texto} cor={s.cor} />
                  <span className={cn('truncate text-[11.5px] tabular-nums', confirma ? 'text-aviso-warnFg' : 'text-ink-muted')}>
                    {n} {n === 1 ? 'registro' : 'registros'}
                    {s.emAndamento > 0 && ` · ${s.emAndamento} em andamento`}
                  </span>
                </div>

                {confirma ? (
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11.5px] text-aviso-warnFg hover:bg-aviso-warnBd hover:text-aviso-warnFg"
                      onClick={() => setConfirmando(null)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="btn-press h-7 px-2 text-[11.5px] bg-aviso-warnFg text-white hover:bg-aviso-warnFg"
                      disabled={excluir.isPending}
                      onClick={() => remover(s)}
                    >
                      Excluir
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    title={`Excluir a tag "${s.texto}" de ${n} ${n === 1 ? 'registro' : 'registros'}`}
                    onClick={() => setConfirmando(s.chave)}
                    className="btn-press flex-shrink-0 rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-aviso-warnBg hover:text-aviso-warnFg"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>

        {sugestoes.length === 0 && (
          <p className="py-6 text-center text-[13px] text-ink-muted">Nenhuma tag em uso.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Aviso de data de início alterada no King ─────────────────────────────────
// A escola corrige a data de entrada e o kms-api-sync propaga (gatilho da
// migration 20260756). O checklist inteiro desliza junto — quem já marcou
// mensagens precisa saber que o calendário mudou debaixo do trabalho dele.

function AvisoInicioMudou({ row }: { row: OnboardingRow }) {
  const confirmar = useConfirmarMudancaInicio()
  const de = fmtData(row.data_inicio_anterior)
  const para = fmtData(row.professor?.data_inicio ?? row.data_inicio)

  return (
    <button
      type="button"
      onClick={() => confirmar.mutate(row.id, {
        onError: () => toast.error('Não foi possível dar ciência.'),
      })}
      title={`A data de início mudou no King: era ${de}, agora é ${para}. Os dias do checklist deslizaram junto — confira o que já foi marcado. Clique para dar ciência e esconder este aviso.`}
      className="btn-press inline-flex items-center gap-1 rounded-full bg-urg-medBg px-2 py-0.5 text-[10px] font-medium text-urg-medFg transition-opacity hover:opacity-80"
    >
      <CalendarClock className="h-3 w-3 flex-shrink-0" />
      <span className="tabular-nums">{de} → {para}</span>
    </button>
  )
}

// ─── Célula de um dia (vazio → Agendado → Enviado) ────────────────────────────

const DIA_CFG: Record<StatusDia, { label: string; cls: string }> = {
  0: { label: '—',        cls: 'bg-surface-subtle text-ink-muted border-line hover:bg-surface-subtle/70' },
  1: { label: 'Agendado', cls: 'bg-urg-medBg text-urg-medFg border-transparent hover:opacity-80' },
  2: { label: 'Enviado',  cls: 'bg-urg-lowBg text-urg-lowFg border-transparent hover:opacity-80' },
}

function DiaCell({ status, atual, onCycle }: { status: StatusDia; atual: boolean; onCycle: () => void }) {
  const cfg = DIA_CFG[status]
  return (
    <button
      type="button"
      onClick={onCycle}
      title="Clique para alternar: vazio → Agendado → Enviado"
      className={cn(
        'btn-press h-7 w-full min-w-[62px] rounded-md border text-[10.5px] font-medium transition-colors',
        cfg.cls,
        atual && 'ring-2 ring-accentBlue/50',
      )}
    >
      {cfg.label}
    </button>
  )
}

// ─── Linha ────────────────────────────────────────────────────────────────────

function OnboardingRowView({ row, sugestoes }: { row: OnboardingRow; sugestoes: Sugestao[] }) {
  const prof = row.professor
  const atualizarDias  = useAtualizarDiasOnboarding()
  const definirTelefone = useDefinirTelefone()
  const remover        = useRemoverOnboarding()

  // Sincroniza o telefone digitado quando o valor do servidor muda (ex.: outro
  // usuário editou) — padrão de ajuste-de-estado-em-render do React, sem effect.
  const telServidor = prof?.telefone ?? ''
  const [tel, setTel] = useState(telServidor)
  const [telAnterior, setTelAnterior] = useState(telServidor)
  if (telServidor !== telAnterior) {
    setTelAnterior(telServidor)
    setTel(telServidor)
  }

  const dataInicio = prof?.data_inicio ?? row.data_inicio
  const n = diaOnboarding(dataInicio)
  const idxAtual = n != null && n >= 1 && n <= 7 ? n - 1 : -1
  const dias: StatusDia[] = row.dias ?? [0, 0, 0, 0, 0, 0, 0]

  const feito      = concluido(dias)
  const atrasado   = !feito && temAtraso(dias, dataInicio)
  const iniciado   = n != null && n >= 1
  const emDestaque = !feito && !atrasado && iniciado // em acompanhamento, no prazo

  function cycle(i: number) {
    const next = [...dias]
    next[i] = ((next[i] + 1) % 3) as StatusDia
    atualizarDias.mutate({ id: row.id, dias: next }, {
      onError: () => toast.error('Não foi possível salvar.'),
    })
  }

  function salvarTel() {
    const novo = tel.trim()
    if (novo === (prof?.telefone ?? '')) return
    definirTelefone.mutate({ professorId: row.professor_id, telefone: novo }, {
      onError: () => toast.error('Não foi possível salvar o telefone.'),
    })
  }

  return (
    <tr className={cn(
      'border-b border-line-soft transition-colors',
      feito
        ? 'opacity-55 hover:opacity-100 hover:bg-surface-subtle/40'
        : atrasado
          ? 'border-l-2 border-l-urg-highFg/60 bg-urg-highBg/10 hover:bg-urg-highBg/20'
          : emDestaque
            ? 'border-l-2 border-l-accentBlue/50 bg-accentBlue-soft/15 hover:bg-accentBlue-soft/25'
            : 'hover:bg-surface-subtle/40',
    )}>
      {/* Nome + tag */}
      <td className="p-2 align-middle">
        <div className="flex items-center gap-2">
          <p
            className="min-w-0 max-w-[230px] truncate text-[13px] font-medium text-ink"
            title={prof?.nome ?? undefined}
          >
            {prof?.nome ?? 'Professor removido'}
          </p>
          <span className="flex-shrink-0">
            <TagDoRegistro row={row} sugestoes={sugestoes} />
          </span>
        </div>
        {row.observacao?.trim() && (
          <p className="mt-0.5 max-w-[380px] truncate text-[11px] text-ink-muted" title={row.observacao}>
            {row.observacao}
          </p>
        )}
      </td>

      {/* Telefone */}
      <td className="p-2 align-middle">
        <Input
          value={tel}
          onChange={e => setTel(e.target.value)}
          onBlur={salvarTel}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder="(00) 00000-0000"
          className="h-8 w-[140px] border-line bg-surface-canvas text-[12px]"
        />
      </td>

      {/* Início + situação */}
      <td className="p-2 align-middle">
        <div className="flex min-w-[124px] flex-col gap-1">
          <span className="text-[12px] tabular-nums text-ink-secondary">{fmtData(dataInicio)}</span>
          <SituacaoChip dias={dias} dataInicio={dataInicio} />
          {row.data_inicio_alterada_em && <AvisoInicioMudou row={row} />}
        </div>
      </td>

      {/* Dia 1..7 */}
      {dias.map((s, i) => (
        <td key={i} className="px-1 py-2 text-center align-middle">
          <DiaCell status={s} atual={i === idxAtual} onCycle={() => cycle(i)} />
        </td>
      ))}

      {/* Ações */}
      <td className="p-2 text-right align-middle">
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-ink-muted hover:text-urg-highFg"
          title="Remover do acompanhamento"
          onClick={() => {
            if (confirm(`Remover ${prof?.nome ?? 'este professor'} do acompanhamento de onboarding?`)) {
              remover.mutate(row.id, { onError: () => toast.error('Não foi possível remover.') })
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  )
}

// ─── Dialog: adicionar professor manualmente ──────────────────────────────────

function AdicionarProfessorDialog({ idsExistentes }: { idsExistentes: Set<string> }) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const { data: professores = [] } = useProfessores()
  const adicionar = useAdicionarOnboarding()

  const candidatos = useMemo(() => {
    const q = norm(busca)
    return professores
      .filter(p => p.status !== 'desligado' && !idsExistentes.has(p.id))
      .filter(p => q.length === 0 || norm(p.nome).includes(q))
      .slice(0, 30)
  }, [professores, idsExistentes, busca])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="btn-press h-9 gap-1.5 border-line">
          <UserPlus className="h-4 w-4" /> Adicionar professor
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Adicionar ao acompanhamento</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
          <Input
            autoFocus
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar professor pelo nome…"
            className="h-10 pl-9 text-[13px] bg-surface-canvas border-line"
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto -mx-1 px-1">
          {candidatos.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-ink-muted">
              {busca ? 'Nenhum professor encontrado.' : 'Digite para buscar.'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {candidatos.map(p => (
                <li key={p.id}>
                  <button
                    className="btn-press w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-subtle"
                    onClick={() => {
                      adicionar.mutate({ professorId: p.id, dataInicio: p.data_inicio }, {
                        onSuccess: () => { toast.success(`${p.nome} adicionado.`); setOpen(false); setBusca('') },
                        onError:   () => toast.error('Não foi possível adicionar.'),
                      })
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink truncate">{p.nome}</span>
                      <span className="block text-[11px] text-ink-muted">Início: {fmtData(p.data_inicio)}</span>
                    </span>
                    <UserPlus className="h-4 w-4 text-ink-muted flex-shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

type Filtro = 'andamento' | 'concluidos' | 'todos'

// Ordena por urgência: atrasados primeiro, depois em andamento, depois quem ainda
// não começou, e concluídos por último. Empate → começo mais antigo primeiro.
function ordem(r: OnboardingRow): number {
  const dias = r.dias ?? []
  const di = r.professor?.data_inicio ?? r.data_inicio
  if (concluido(dias)) return 3
  if (temAtraso(dias, di)) return 0
  const n = diaOnboarding(di)
  return n != null && n >= 1 ? 1 : 2
}

export function MensagensTab() {
  const { data: rows = [], isLoading } = useOnboarding()
  const [filtro, setFiltro] = useState<Filtro>('andamento')
  const [busca, setBusca] = useState('')
  const [tagFiltro, setTagFiltro] = useState<string | null>(null)

  const idsExistentes = useMemo(() => new Set(rows.map(r => r.professor_id)), [rows])

  // Tags já em uso — servem de atalho no editor, de filtro rápido na lista e de
  // catálogo na gerência. Grafias diferentes da mesma tag ("Contrato"/"contrato")
  // contam como uma só: a chave é o texto normalizado.
  const sugestoes = useMemo<Sugestao[]>(() => {
    const m = new Map<string, Sugestao>()
    for (const r of rows) {
      const t = r.tag_texto?.trim()
      if (!t) continue
      const chave = norm(t)
      const s = m.get(chave) ?? { chave, texto: t, cor: r.tag_cor, ids: [], emAndamento: 0 }
      s.ids.push(r.id)
      if (!concluido(r.dias ?? [])) s.emAndamento++
      m.set(chave, s)
    }
    return [...m.values()].sort((a, b) => a.texto.localeCompare(b.texto))
  }, [rows])

  // Um professor só sai de "Em andamento" quando os 7 dias estão enviados.
  function bucketDe(r: OnboardingRow): Exclude<Filtro, 'todos'> {
    return concluido(r.dias ?? []) ? 'concluidos' : 'andamento'
  }

  const contagem = useMemo(() => {
    let andamento = 0, concluidos = 0
    for (const r of rows) {
      if (bucketDe(r) === 'concluidos') concluidos++
      else andamento++
    }
    return { andamento, concluidos, todos: rows.length }
  }, [rows])

  const visiveis = useMemo(() => {
    const q = norm(busca)
    return rows
      .filter(r => filtro === 'todos' || bucketDe(r) === filtro)
      .filter(r => tagFiltro == null || norm(r.tag_texto ?? '') === tagFiltro)
      .filter(r => q.length === 0 || [
        r.professor?.nome ?? '', r.tag_texto ?? '', r.observacao ?? '',
      ].some(v => norm(v).includes(q)))
      .sort((a, b) => {
        const oa = ordem(a), ob = ordem(b)
        if (oa !== ob) return oa - ob
        const da = a.professor?.data_inicio ?? a.data_inicio ?? ''
        const db = b.professor?.data_inicio ?? b.data_inicio ?? ''
        return da.localeCompare(db) // começo mais antigo primeiro
      })
  }, [rows, filtro, busca, tagFiltro])

  const chips: { id: Filtro; label: string; count: number }[] = [
    { id: 'andamento',  label: 'Em andamento', count: contagem.andamento },
    { id: 'concluidos', label: 'Concluídos',   count: contagem.concluidos },
    { id: 'todos',      label: 'Todos',        count: contagem.todos },
  ]

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-ink-muted">
        Acompanhamento das mensagens de boas-vindas nos 7 primeiros <strong className="font-medium text-ink-secondary">dias úteis</strong> de
        cada professor que entra — sábado e domingo não contam.
      </p>

      {/* Controles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {chips.map(c => (
            <button
              key={c.id}
              onClick={() => setFiltro(c.id)}
              className={cn(
                'btn-press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                filtro === c.id
                  ? 'bg-surface-subtle text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
                  : 'text-ink-secondary hover:text-ink hover:bg-surface-subtle/60',
              )}
            >
              {c.label}
              <span className={cn(
                'inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] tabular-nums',
                filtro === c.id ? 'bg-accentBlue-soft text-accentBlue' : 'bg-surface-subtle text-ink-muted',
              )}>
                {c.count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar professor, tag ou observação…"
              className="h-9 w-[260px] pl-9 text-[13px] bg-surface-canvas border-line rounded-xl"
            />
          </div>
          <AdicionarProfessorDialog idsExistentes={idsExistentes} />
        </div>
      </div>

      {/* Filtro por tag (só aparece quando existe alguma) */}
      {sugestoes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Tags</span>
          <GerenciarTagsDialog
            sugestoes={sugestoes}
            aoExcluir={chave => setTagFiltro(f => (f === chave ? null : f))}
          />
          {sugestoes.map(s => {
            const ativo = tagFiltro === s.chave
            return (
              <button
                key={s.chave}
                type="button"
                onClick={() => setTagFiltro(ativo ? null : s.chave)}
                className={cn('btn-press rounded-full transition-all', ativo ? 'ring-2 ring-ink/60' : 'opacity-75 hover:opacity-100')}
              >
                <TagChip texto={s.texto} cor={s.cor} />
              </button>
            )
          })}
          {tagFiltro && (
            <button
              type="button"
              onClick={() => setTagFiltro(null)}
              className="btn-press text-[11.5px] text-ink-muted underline-offset-2 hover:underline"
            >
              limpar
            </button>
          )}
        </div>
      )}

      {/* Tabela — altura presa à viewport: o cabeçalho fica fixo no topo e a
          barra de rolagem acompanha a tela em vez de fugir para o fim da lista. */}
      {isLoading ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">
          {rows.length === 0
            ? 'Nenhum professor recém-chegado no acompanhamento ainda. Assim que alguém iniciar (ou estiver perto de iniciar), aparece aqui automaticamente.'
            : busca
              ? `Nenhum professor encontrado para "${busca}".`
              : 'Nada neste filtro.'}
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          <div className="relative max-h-[calc(100vh-330px)] min-h-[260px] w-full overflow-auto overscroll-contain">
            <table className="w-full caption-bottom">
              <thead className="sticky top-0 z-10 bg-surface-canvas shadow-[0_1px_0_0_var(--border-soft)]">
                <tr>
                  <th className="h-10 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Professor</th>
                  <th className="h-10 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Telefone</th>
                  <th className="h-10 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Início</th>
                  {[1, 2, 3, 4, 5, 6, 7].map(d => (
                    <th key={d} title={`${d}º dia útil`} className="h-10 px-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Dia {d}</th>
                  ))}
                  <th className="h-10 px-2" />
                </tr>
              </thead>
              <tbody>
                {visiveis.map(r => <OnboardingRowView key={r.id} row={r} sugestoes={sugestoes} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-urg-lowBg" /> Enviado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-urg-medBg" /> Agendado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-line bg-surface-subtle" /> Não enviado
        </span>
        <span className="text-line-soft">·</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-1 rounded-full bg-accentBlue/60" /> Em acompanhamento
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-1 rounded-full bg-urg-highFg/70" /> Dia atrasado
        </span>
        <span className="text-line-soft">·</span>
        <span className="flex items-center gap-1.5">
          <TagIcon className="h-3 w-3" /> Clique na tag ao lado do nome para rotular e anotar
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarClock className="h-3 w-3" /> Data de início mudou no King — confira o checklist e clique para dar ciência
        </span>
        <span className="flex items-center gap-1.5">
          <Check className="h-3 w-3" /> Clique numa célula pra alternar; sai da lista só quando os 7 dias forem enviados
        </span>
      </div>
    </div>
  )
}
