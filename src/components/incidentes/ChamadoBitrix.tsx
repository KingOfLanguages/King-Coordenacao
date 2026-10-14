import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ExternalLink, Lock, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { normalizarPrioridade, type Prioridade } from '@/lib/incidentePrioridade'
import { useNomesPorPerfilId } from '@/hooks/usePerfisPublicos'
import {
  useChamadoDoIncidente, useOpcoesBitrix, useVincularBitrix, useAbrirChamadoBitrix,
  type MembroSuporte, type OpcoesBitrix,
} from '@/hooks/useChamadoBitrix'
import type { Incidente } from '@/hooks/useIncidentes'

// ─────────────────────────────────────────────────────────────────────────────
// Chamado no Bitrix — a área do painel do incidente que gera uma tarefa para a
// equipe de suporte ao aluno quando o caso pede ação deles (2026-10-14).
// Só para prioridade Média, Alta ou Urgente. Recebe qualquer pessoa do suporte
// ao aluno; a líder do time dela e quem abre vão sempre como observadoras, e
// dá para acrescentar outras (suporte ou coordenação). A tarefa sai pela conta
// dona do webhook, com a legenda "Aberto no Nexus".
// ─────────────────────────────────────────────────────────────────────────────

const PRIORIDADES_COM_CHAMADO: Prioridade[] = ['Média', 'Alta', 'Urgente']

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
const primeiroNome = (nome: string) => nome.split(' ')[0]

export function ChamadoBitrix({ incidente, podeAbrir }: { incidente: Incidente; podeAbrir: boolean }) {
  const { data: chamado, isLoading } = useChamadoDoIncidente(incidente.id)
  const { mapa: nomes } = useNomesPorPerfilId()
  const [abrindo, setAbrindo] = useState(false)

  const nivel = normalizarPrioridade(incidente.urgency)
  const elegivel = PRIORIDADES_COM_CHAMADO.includes(nivel) && !incidente.resolved

  if (isLoading) return null

  if (chamado) {
    const abridor = chamado.aberto_por ? nomes.get(chamado.aberto_por) : null
    return (
      <section className="space-y-1.5" aria-label="Chamado no Bitrix">
        <p className="label-micro">Chamado no Bitrix</p>
        <div className="space-y-1 rounded-lg border border-aviso-infoBd bg-aviso-infoBg px-3 py-2.5 text-[12.5px] text-aviso-infoFg">
          {chamado.bitrix_task_id ? (
            <>
              <p className="font-medium">
                Tarefa #{chamado.bitrix_task_id} com {chamado.responsavel_nome}
              </p>
              <p className="text-[11.5px] opacity-90">
                Aberto{abridor ? ` por ${abridor}` : ''} em {dataCurta(chamado.aberto_em)}
                {chamado.observadores.length > 0 && <> · observando: {chamado.observadores.map(o => primeiroNome(o.nome)).join(', ')}</>}
              </p>
              {chamado.bitrix_url && (
                <a href={chamado.bitrix_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 pt-0.5 text-[12px] font-medium underline-offset-2 hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" />Abrir no Bitrix
                </a>
              )}
            </>
          ) : (
            <p>Abrindo o chamado no Bitrix…</p>
          )}
        </div>
      </section>
    )
  }

  if (!elegivel || !podeAbrir) return null

  return (
    <section className="space-y-1.5" aria-label="Chamado no Bitrix">
      <p className="label-micro">Chamado no Bitrix</p>
      {abrindo ? (
        <FormularioChamado incidente={incidente} nivel={nivel} onFechar={() => setAbrindo(false)} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5">
          <p className="min-w-0 flex-1 text-[12px] leading-snug text-ink-muted">
            Precisa de ação do suporte ao aluno? Gere uma tarefa no Bitrix a partir deste incidente.
          </p>
          <Button size="sm" variant="outline" onClick={() => setAbrindo(true)} className="btn-press h-8 gap-1.5 border-line text-[12px]">
            <Send className="h-3.5 w-3.5" />Gerar chamado
          </Button>
        </div>
      )}
    </section>
  )
}

// ─── Formulário ──────────────────────────────────────────────────────────────

function FormularioChamado({ incidente, nivel, onFechar }: { incidente: Incidente; nivel: Prioridade; onFechar: () => void }) {
  const opcoes = useOpcoesBitrix(true)
  return (
    <div className="space-y-3 rounded-lg border border-line px-3 py-3">
      {opcoes.isLoading ? (
        <p className="text-[12px] text-ink-muted">Buscando a equipe no Bitrix…</p>
      ) : opcoes.error ? (
        <p className="text-[12px] text-urg-highFg">{opcoes.error instanceof Error ? opcoes.error.message : 'Não foi possível falar com o Bitrix.'}</p>
      ) : opcoes.data && !opcoes.data.eu ? (
        <QuemSouEu opcoes={opcoes.data} />
      ) : opcoes.data ? (
        <Campos incidente={incidente} nivel={nivel} opcoes={opcoes.data} onFechar={onFechar} />
      ) : null}
      {(opcoes.isLoading || opcoes.error || !opcoes.data?.eu) && (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={onFechar} className="h-7 text-[12px] text-ink-secondary">Cancelar</Button>
        </div>
      )}
    </div>
  )
}

/** Primeira vez de quem não tem o mesmo e-mail no Bitrix: escolhe e fica gravado. */
function QuemSouEu({ opcoes }: { opcoes: OpcoesBitrix }) {
  const vincular = useVincularBitrix()
  const [id, setId] = useState('')
  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-relaxed text-ink-secondary">
        <strong className="font-medium text-ink">Quem é você no Bitrix?</strong> Quem abre o chamado entra sempre como
        observador. Isso fica gravado: é só desta vez.
      </p>
      <div className="flex gap-2">
        <Select value={id} onValueChange={setId}>
          <SelectTrigger size="sm" className="min-w-0 flex-1 border-line bg-surface-canvas text-[12.5px] text-ink">
            <SelectValue placeholder="Escolha o seu nome" />
          </SelectTrigger>
          <SelectContent className="border-line bg-surface-canvas text-ink">
            {(opcoes.todos ?? []).map(p => (
              <SelectItem key={p.id} value={String(p.id)} className="text-[12.5px]">
                {p.nome}{p.cargo && <span className="text-ink-muted"> · {p.cargo}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!id || vincular.isPending}
          onClick={() => vincular.mutate(Number(id), {
            onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível gravar.'),
          })}
          className="h-8 text-[12px]"
        >
          {vincular.isPending ? 'Gravando…' : 'Sou eu'}
        </Button>
      </div>
    </div>
  )
}

function Campos({ incidente, nivel, opcoes, onFechar }: {
  incidente: Incidente; nivel: Prioridade; opcoes: OpcoesBitrix; onFechar: () => void
}) {
  const abrir = useAbrirChamadoBitrix()
  const [responsavelId, setResponsavelId] = useState('')
  const [extras, setExtras] = useState<number[]>([])
  const eu = opcoes.eu!

  const nomeDe = useMemo(() => {
    const m = new Map<number, string>()
    for (const p of [...opcoes.equipe, ...opcoes.coordenacao]) m.set(p.id, p.nome)
    m.set(eu.id, eu.nome)
    return m
  }, [opcoes, eu])

  // Times pela líder: "Time da Flávia", "Time da Sayuri".
  const times = useMemo(() => {
    const grupos = new Map<string, MembroSuporte[]>()
    for (const p of opcoes.equipe) {
      const lider = p.lider ? p.id : p.lideres[0]
      const rotulo = lider ? `Time da ${primeiroNome(nomeDe.get(lider) ?? '')}` : 'Suporte ao aluno'
      grupos.set(rotulo, [...(grupos.get(rotulo) ?? []), p])
    }
    return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
  }, [opcoes.equipe, nomeDe])

  const responsavel = opcoes.equipe.find(p => p.id === Number(responsavelId)) ?? null
  // Fixos: quem abre e a(s) líder(es) do time de quem recebe. Quem recebe não observa.
  const fixos = [...new Set([eu.id, ...(responsavel?.lideres ?? [])])].filter(id => id !== responsavel?.id)
  const observadores = [...new Set([...fixos, ...extras])].filter(id => id !== responsavel?.id)
  const disponiveis = (lista: { id: number; nome: string }[]) =>
    lista.filter(p => p.id !== responsavel?.id && !observadores.includes(p.id))

  const prioridadeBitrix = nivel === 'Média' ? 'normal' : 'alta'
  const imagens = Math.min(incidente.image_urls.length, 5)

  function enviar() {
    if (!responsavel) return
    abrir.mutate(
      { incidenteId: incidente.id, responsavelId: responsavel.id, observadores },
      {
        onSuccess: r => {
          toast.success(`Chamado #${r.taskId} aberto no Bitrix com ${primeiroNome(responsavel.nome)}.`)
          if (r.falhasAnexo > 0) toast.warning(`${r.falhasAnexo} imagem(ns) não anexou: os links estão na descrição da tarefa.`)
          onFechar()
        },
        onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível abrir o chamado.'),
      },
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-[11.5px] font-medium text-ink-secondary">Quem recebe</p>
        <Select value={responsavelId} onValueChange={setResponsavelId}>
          <SelectTrigger size="sm" className="w-full border-line bg-surface-canvas text-[12.5px] text-ink">
            <SelectValue placeholder="Alguém do suporte ao aluno" />
          </SelectTrigger>
          <SelectContent className="border-line bg-surface-canvas text-ink">
            {times.map(([rotulo, pessoas]) => (
              <SelectGroup key={rotulo}>
                <SelectLabel className="text-[11px] text-ink-muted">{rotulo}</SelectLabel>
                {pessoas.map(p => (
                  <SelectItem key={p.id} value={String(p.id)} className="text-[12.5px]">
                    {p.nome}{p.lider && <span className="text-ink-muted"> · líder</span>}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11.5px] font-medium text-ink-secondary">Observadores</p>
        <div className="flex flex-wrap gap-1.5">
          {observadores.map(id => {
            const fixo = fixos.includes(id)
            return (
              <span
                key={id}
                title={id === eu.id ? 'Quem abre entra sempre' : fixo ? 'Líder do time de quem recebe: entra sempre' : undefined}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium',
                  fixo ? 'bg-surface-subtle text-ink-secondary' : 'bg-accentBlue-soft text-accentBlue',
                )}
              >
                {fixo && <Lock className="h-3 w-3" />}
                {nomeDe.get(id) ?? id}{id === eu.id && ' (você)'}
                {!fixo && (
                  <button type="button" onClick={() => setExtras(x => x.filter(v => v !== id))} aria-label={`Tirar ${nomeDe.get(id)}`} className="btn-press -mr-0.5 rounded-full hover:opacity-70">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            )
          })}
        </div>
        <Select value="" onValueChange={v => setExtras(x => [...x, Number(v)])}>
          <SelectTrigger size="sm" className="w-full border-line bg-surface-canvas text-[12px] text-ink-muted">
            <SelectValue placeholder="Adicionar observador…" />
          </SelectTrigger>
          <SelectContent className="border-line bg-surface-canvas text-ink">
            {([['Suporte ao aluno', opcoes.equipe], ['Coordenação', opcoes.coordenacao]] as const).map(([rotulo, lista]) => {
              const livres = disponiveis(lista)
              return livres.length > 0 && (
                <SelectGroup key={rotulo}>
                  <SelectLabel className="text-[11px] text-ink-muted">{rotulo}</SelectLabel>
                  {livres.map(p => (
                    <SelectItem key={p.id} value={String(p.id)} className="text-[12.5px]">{p.nome}</SelectItem>
                  ))}
                </SelectGroup>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      <p className="text-[11.5px] leading-relaxed text-ink-muted">
        Vai como tarefa criada por {opcoes.criador?.nome ?? 'quem configurou o Bitrix'}, com a legenda “Aberto no Nexus”,
        prioridade {prioridadeBitrix}
        {incidente.prazo_resolucao && <>, prazo {dataCurta(incidente.prazo_resolucao)}</>}
        {imagens > 0 && <> e {imagens === 1 ? 'a imagem anexada' : `as ${imagens} imagens anexadas`}</>}.
      </p>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onFechar} className="h-8 text-[12px] text-ink-secondary">Cancelar</Button>
        <Button
          size="sm"
          disabled={!responsavel || abrir.isPending}
          onClick={enviar}
          className="btn-press h-8 gap-1.5 bg-accentBlue text-[12px] text-white hover:bg-accentBlue-hov"
        >
          <Send className="h-3.5 w-3.5" />{abrir.isPending ? 'Abrindo…' : 'Abrir chamado'}
        </Button>
      </div>
    </div>
  )
}
