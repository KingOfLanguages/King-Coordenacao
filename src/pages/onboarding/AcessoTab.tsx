import { useEffect, useMemo, useState } from 'react'
import { Search, Send, UserPlus, UserX, Lock, Globe, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { dataBR } from '@/lib/formato'
import { useAuth } from '@/contexts/AuthContext'
import { podeGerirTrilha } from '@/lib/permissions'
import { useAgora } from '@/hooks/useAgora'
import { dataHoraBR, fmtHaQuanto } from '@/lib/prazoTrilha'
import {
  useCandidatosTrilha, useConfigTrilha, useConvidarTrilha, useDefinirAcesso, useLiberarProfessores,
  useRetirarLiberacao,
} from '@/hooks/useWelcomePathAdmin'
import { useLinhasTrilha, type LinhaTrilha } from './trilhaComum'
import { ChipSituacao } from './TrilhaUI'

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Acesso e convites" (22/10/2026): quem pode fazer a trilha.
//
// O RH quer um grupo pequeno por enquanto. Três partes:
//
//   modo        só liberados (o portal recusa os outros) ou todos, como era;
//   liberar     busca entre os ativos ainda não liberados, com um rótulo de
//               turma ("Piloto RH") e, se quiser, o convite junto;
//   liberados   quem está dentro, com o convite (enviar/reenviar) e o "tirar".
//
// O convite nunca sai sozinho: o envio automático foi pausado em 22/10
// (migration 20260808) e aqui ele sai por botão (função convite-trilha).
// ─────────────────────────────────────────────────────────────────────────────

/** Espera a pessoa parar de digitar antes de buscar no banco. */
function useAtrasado<T>(valor: T, ms: number): T {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

function ModoAcesso({ podeGerir }: { podeGerir: boolean }) {
  const { data: config } = useConfigTrilha()
  const definir = useDefinirAcesso()
  const soLiberados = config?.so_liberados ?? true

  function escolher(valor: boolean) {
    if (valor === soLiberados || !podeGerir) return
    const aviso = valor
      ? 'Fechar a trilha para quem não está na lista de liberados? Quem estiver no meio dela sem estar liberado deixa de entrar.'
      : 'Abrir a trilha para todos os professores ativos? Qualquer um entra com o código do e-mail. O convite continua saindo só pelo botão.'
    if (!confirm(aviso)) return
    definir.mutate(valor, {
      onSuccess: () => toast.success(valor ? 'Trilha só para liberados' : 'Trilha aberta a todos'),
      onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível mudar o acesso.'),
    })
  }

  const opcoes = [
    {
      valor: true, icone: Lock, titulo: 'Só os professores liberados',
      texto: 'O portal recusa quem não está na lista abaixo e mostra o WhatsApp do suporte. É o modo do grupo de controle do RH.',
    },
    {
      valor: false, icone: Globe, titulo: 'Todos os professores',
      texto: 'Qualquer professor ativo entra com o código do e-mail, como antes de 22/10. O convite continua saindo só pelo botão.',
    },
  ]

  return (
    <section className="space-y-2">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">Quem pode entrar na trilha</h2>
      <div className="grid gap-2 md:grid-cols-2">
        {opcoes.map(o => {
          const ativo = o.valor === soLiberados
          const Icone = o.icone
          return (
            <button
              key={String(o.valor)}
              type="button"
              disabled={!podeGerir || definir.isPending}
              onClick={() => escolher(o.valor)}
              aria-pressed={ativo}
              className={cn(
                'btn-press flex gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors disabled:cursor-default',
                ativo ? 'border-accentBlue bg-accentBlue-soft' : 'border-line-soft hover:bg-surface-subtle',
              )}
            >
              <Icone className={cn('mt-0.5 h-4 w-4 flex-shrink-0', ativo ? 'text-accentBlue' : 'text-ink-muted')} />
              <span className="min-w-0 space-y-0.5">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                  {o.titulo} {ativo && <Check className="h-3.5 w-3.5 text-accentBlue" />}
                </span>
                <span className="block text-[12px] leading-relaxed text-ink-muted">{o.texto}</span>
              </span>
            </button>
          )
        })}
      </div>
      {config?.alterado_por_nome && config.alterado_em && (
        <p className="text-[11.5px] text-ink-muted">
          Última mudança: {dataHoraBR(config.alterado_em)}, por {config.alterado_por_nome}.
        </p>
      )}
    </section>
  )
}

function Liberar({ rotulosUsados }: { rotulosUsados: string[] }) {
  const [busca, setBusca] = useState('')
  const termo = useAtrasado(busca, 300)
  const { data: candidatos = [], isFetching } = useCandidatosTrilha(termo)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [rotulo, setRotulo] = useState('')
  const [comConvite, setComConvite] = useState(false)
  const liberar = useLiberarProfessores()
  const convidar = useConvidarTrilha()
  const [enviando, setEnviando] = useState(false)
  const agora = useAgora(60_000)

  function alternar(id: string) {
    setMarcados(atual => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  async function confirmar() {
    const ids = [...marcados]
    if (!ids.length) return
    try {
      const n = await liberar.mutateAsync({ ids, rotulo })
      toast.success(`${n} ${n === 1 ? 'professor liberado' : 'professores liberados'}`)
      setMarcados(new Set())
      if (!comConvite) return
      // Um por vez: são poucos, e cada erro aparece com o nome de quem ficou sem.
      setEnviando(true)
      let ok = 0
      for (const id of ids) {
        try {
          await convidar.mutateAsync(id)
          ok++
        } catch (e) {
          const nome = candidatos.find(c => c.professor_id === id)?.nome ?? 'um professor'
          toast.error(`Convite de ${nome}: ${e instanceof Error ? e.message : 'falhou'}`)
        }
      }
      if (ok) toast.success(`${ok} ${ok === 1 ? 'convite enviado' : 'convites enviados'}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível liberar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">Liberar professores</h2>
      <div className="card-surface space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome ou e-mail entre os ativos…"
              className="h-9 rounded-xl border-line bg-surface-canvas pl-9 text-[13px]"
            />
          </div>
          <Input
            value={rotulo}
            onChange={e => setRotulo(e.target.value)}
            maxLength={60}
            list="wp-rotulos"
            placeholder="Turma (opcional): Piloto RH"
            className="h-9 w-[220px] rounded-xl border-line bg-surface-canvas text-[13px]"
          />
          <datalist id="wp-rotulos">
            {rotulosUsados.map(r => <option key={r} value={r} />)}
          </datalist>
        </div>

        <p className="text-[11.5px] text-ink-muted">
          {termo.trim()
            ? `Ativos ainda não liberados com "${termo.trim()}" no nome ou no e-mail.`
            : 'Sem busca: quem chegou nos últimos 30 dias ou começa em breve, mais novos primeiro.'}
          {isFetching && ' Buscando…'}
        </p>

        <div className="max-h-[320px] overflow-auto rounded-xl border border-line-soft">
          {candidatos.length === 0 ? (
            <p className="p-6 text-center text-[12.5px] text-ink-muted">
              {isFetching ? 'Buscando…' : 'Ninguém encontrado.'}
            </p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {candidatos.map(c => {
                const marcado = marcados.has(c.professor_id)
                return (
                  <li key={c.professor_id}>
                    <label className={cn(
                      'flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors',
                      marcado ? 'bg-accentBlue-soft' : 'hover:bg-surface-subtle',
                    )}>
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => alternar(c.professor_id)}
                        className="h-4 w-4 accent-current"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">{c.nome}</span>
                        <span className="block truncate text-[11.5px] text-ink-muted">
                          {[c.grupo, c.email ?? 'sem e-mail'].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="hidden flex-shrink-0 text-right text-[11.5px] text-ink-muted sm:block">
                        {c.data_inicio && (
                          c.data_inicio > new Date(agora).toISOString().slice(0, 10)
                            ? `começa em ${dataBR(c.data_inicio)}`
                            : `começou em ${dataBR(c.data_inicio)}`
                        )}
                        {c.chegou_em && <><br />cadastro {fmtHaQuanto(agora - new Date(c.chegou_em).getTime())}</>}
                      </span>
                      {(c.abriu_trilha || c.convite_em) && (
                        <span className="flex-shrink-0 rounded-full bg-surface-subtle px-2 py-0.5 text-[10.5px] text-ink-secondary">
                          {c.abriu_trilha ? 'já abriu a trilha' : 'já recebeu convite'}
                        </span>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-secondary">
            <input
              type="checkbox"
              checked={comConvite}
              onChange={e => setComConvite(e.target.checked)}
              className="h-3.5 w-3.5 accent-current"
            />
            Mandar o convite por e-mail agora
          </label>
          <Button
            size="sm"
            className="btn-press h-9 gap-1.5"
            disabled={!marcados.size || liberar.isPending || enviando}
            onClick={confirmar}
          >
            <UserPlus className="h-4 w-4" />
            {liberar.isPending || enviando
              ? 'Salvando…'
              : marcados.size
                ? `Liberar ${marcados.size} ${marcados.size === 1 ? 'professor' : 'professores'}`
                : 'Liberar'}
          </Button>
        </div>
      </div>
    </section>
  )
}

function LinhaLiberado({ l, podeGerir }: { l: LinhaTrilha; podeGerir: boolean }) {
  const convidar = useConvidarTrilha()
  const retirar = useRetirarLiberacao()
  const cabeConvite = !l.primeiro_acesso_em && !l.dispensado_em

  return (
    <tr className="border-b border-line-soft">
      <td className="px-3 py-2.5 align-middle">
        <p className="whitespace-nowrap text-[13px] font-medium text-ink">{l.nome}</p>
        <p className="whitespace-nowrap text-[11px] text-ink-muted">{l.email ?? 'sem e-mail'}</p>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 align-middle text-[12px] text-ink-secondary">{l.rotulo ?? '—'}</td>
      <td className="whitespace-nowrap px-3 py-2.5 align-middle text-[12px] text-ink-secondary">
        {l.liberado_em && dataBR(l.liberado_em.slice(0, 10))}
        {l.liberado_por && <span className="text-ink-muted"> · {l.liberado_por.split(' ')[0]}</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 align-middle text-[12px]">
        {l.convite_em
          ? <span className="text-ink-secondary">{dataHoraBR(l.convite_em)}<span className="text-ink-muted"> · {l.convite_manual ? l.convite_por?.split(' ')[0] ?? '—' : 'automático'}</span></span>
          : <span className="text-ink-subtle">não enviado</span>}
      </td>
      <td className="px-3 py-2.5 align-middle"><ChipSituacao situacao={l.situacao} /></td>
      <td className="px-3 py-2.5 text-right align-middle">
        {podeGerir && (
          <div className="flex items-center justify-end gap-1">
            {cabeConvite && (
              <Button
                size="sm" variant="outline"
                className="btn-press h-7 gap-1 border-line px-2.5 text-[11.5px]"
                disabled={convidar.isPending || !l.email}
                onClick={() => {
                  if (l.convite_em && !confirm(`Mandar o convite de novo para ${l.email}?`)) return
                  convidar.mutate(l.professor_id, {
                    onSuccess: r => toast.success(`Convite enviado para ${r.para}`),
                    onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível enviar o convite.'),
                  })
                }}
              >
                <Send className="h-3 w-3" /> {convidar.isPending ? 'Enviando…' : l.convite_em ? 'Reenviar' : 'Enviar convite'}
              </Button>
            )}
            <Button
              size="sm" variant="ghost"
              className="btn-press h-7 gap-1 px-2 text-[11.5px] text-ink-muted"
              disabled={retirar.isPending}
              title="Tirar da trilha"
              onClick={() => {
                const progresso = l.primeiro_acesso_em ? ' O progresso fica guardado e volta se ele for liberado de novo.' : ''
                if (!confirm(`Tirar ${l.nome} da trilha? Ele deixa de entrar no portal.${progresso}`)) return
                retirar.mutate(l.professor_id, {
                  onSuccess: () => toast.success(`${l.nome.split(' ')[0]} saiu da trilha`),
                  onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível tirar da trilha.'),
                })
              }}
            >
              <UserX className="h-3.5 w-3.5" /> Tirar
            </Button>
          </div>
        )}
      </td>
    </tr>
  )
}

export function AcessoTab() {
  const { profile } = useAuth()
  const podeGerir = podeGerirTrilha(profile)
  const { linhas, carregando } = useLinhasTrilha()
  const [rotulo, setRotulo] = useState('todos')
  const convidar = useConvidarTrilha()
  const [enviando, setEnviando] = useState(false)

  const liberados = useMemo(
    () => linhas.filter(l => l.liberado_em).sort((a, b) => (b.liberado_em ?? '').localeCompare(a.liberado_em ?? '')),
    [linhas],
  )
  const rotulos = useMemo(
    () => [...new Set(liberados.map(l => l.rotulo).filter((r): r is string => !!r))].sort(),
    [liberados],
  )
  const visiveis = liberados.filter(l => rotulo === 'todos' || (rotulo === '' ? !l.rotulo : l.rotulo === rotulo))
  const semConvite = visiveis.filter(l => !l.convite_em && !l.primeiro_acesso_em && !l.dispensado_em && l.email)

  async function convidarTodos() {
    if (!confirm(`Mandar o convite por e-mail para ${semConvite.length} ${semConvite.length === 1 ? 'professor' : 'professores'}?`)) return
    setEnviando(true)
    let ok = 0
    for (const l of semConvite) {
      try {
        await convidar.mutateAsync(l.professor_id)
        ok++
      } catch (e) {
        toast.error(`Convite de ${l.nome}: ${e instanceof Error ? e.message : 'falhou'}`)
      }
    }
    setEnviando(false)
    if (ok) toast.success(`${ok} ${ok === 1 ? 'convite enviado' : 'convites enviados'}`)
  }

  return (
    <div className="space-y-8">
      <ModoAcesso podeGerir={podeGerir} />

      {podeGerir && <Liberar rotulosUsados={rotulos} />}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">
            Liberados · {visiveis.length}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {rotulos.length > 0 && (
              <select
                value={rotulo}
                onChange={e => setRotulo(e.target.value)}
                aria-label="Turma"
                className="h-9 rounded-xl border border-line bg-surface-canvas px-3 text-[12.5px] text-ink"
              >
                <option value="todos">Todas as turmas</option>
                {rotulos.map(r => <option key={r} value={r}>{r}</option>)}
                <option value="">Sem turma</option>
              </select>
            )}
            {podeGerir && semConvite.length > 0 && (
              <Button size="sm" variant="outline" className="btn-press h-9 gap-1.5 border-line" disabled={enviando} onClick={convidarTodos}>
                <Send className="h-4 w-4" />
                {enviando ? 'Enviando…' : `Convidar ${semConvite.length} sem convite`}
              </Button>
            )}
          </div>
        </div>

        {carregando ? (
          <div className="card-surface p-8 text-center text-[13px] text-ink-muted">Carregando…</div>
        ) : visiveis.length === 0 ? (
          <div className="card-surface p-8 text-center text-[13px] text-ink-muted">Ninguém liberado ainda.</div>
        ) : (
          <div className="card-surface overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line-soft">
                  {['Professor', 'Turma', 'Liberado', 'Convite', 'Situação', ''].map(h => (
                    <th key={h} className="h-10 whitespace-nowrap px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map(l => <LinhaLiberado key={l.professor_id} l={l} podeGerir={podeGerir} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
