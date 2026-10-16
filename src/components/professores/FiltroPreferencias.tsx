import { useMemo, useState } from 'react'
import { Baby, SlidersHorizontal, X } from 'lucide-react'
import { Abas } from '@/components/ui/abas'
import { cn } from '@/lib/utils'
import {
  opcoesPreferencias, passaCriancas,
  type FiltroCriancas, type GrupoPreferencia, type PerfilProfessor, type SelecaoPreferencias,
} from '@/hooks/usePerfilProfessor'

// ─────────────────────────────────────────────────────────────────────────────
// Barra de filtros por preferência do onboarding do King, na lista de
// professores. "Aula para criança" fica sempre à vista (é o filtro mais usado);
// o resto abre num painel.
//
// Os números são da lista atual (busca, grupo e coordenador já aplicados); os dos
// chips já respeitam o filtro de criança. "Sem resposta" ≠ "Não dá": o professor que não
// preencheu o público no King não disse nada sobre criança.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  /** Perfis dos professores da lista atual (undefined = sem perfil importado). */
  perfis: (PerfilProfessor | undefined)[]
  criancas: FiltroCriancas
  onCriancas: (v: FiltroCriancas) => void
  selecao: SelecaoPreferencias
  onSelecao: (s: SelecaoPreferencias) => void
}

export function FiltroPreferencias({ perfis, criancas, onCriancas, selecao, onSelecao }: Props) {
  const [aberto, setAberto] = useState(false)

  const contagem = useMemo(() => {
    let sim = 0, nao = 0, sem = 0, responderam = 0
    for (const p of perfis) {
      const v = p?.atende_criancas ?? null
      if (v === true) sim++
      else if (v === false) nao++
      else sem++
      if (p?.publico?.length || p?.niveis?.length || p?.idiomas?.length) responderam++
    }
    return { sim, nao, sem, responderam }
  }, [perfis])

  // Os chips contam dentro do filtro de criança já escolhido ("das que dão aula para criança, quantas…").
  const grupos = useMemo(
    () => opcoesPreferencias(perfis.filter(p => passaCriancas(p, criancas))),
    [perfis, criancas],
  )
  const nEscolhidos = Object.values(selecao).reduce((n, v) => n + (v?.length ?? 0), 0)
  const algumFiltro = criancas !== 'todos' || nEscolhidos > 0

  function alternar(grupo: GrupoPreferencia, valor: string) {
    const atual = selecao[grupo] ?? []
    const novo = atual.includes(valor) ? atual.filter(v => v !== valor) : [...atual, valor]
    onSelecao({ ...selecao, [grupo]: novo })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-secondary">
          <Baby className="h-3.5 w-3.5" />Aula para criança
        </span>
        <Abas<FiltroCriancas>
          tamanho="sm"
          ariaLabel="Aula para criança"
          valor={criancas}
          onChange={onCriancas}
          abas={[
            { id: 'todos', label: 'Todos' },
            { id: 'sim',   label: 'Dá aula',      n: contagem.sim },
            { id: 'nao',   label: 'Não dá',       n: contagem.nao },
            { id: 'sem',   label: 'Sem resposta', n: contagem.sem },
          ]}
        />

        <button
          type="button"
          onClick={() => setAberto(a => !a)}
          aria-expanded={aberto}
          className={cn(
            'btn-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors',
            aberto || nEscolhidos > 0
              ? 'border-line-strong bg-surface-subtle text-ink'
              : 'border-line text-ink-secondary hover:text-ink',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Preferências
          {nEscolhidos > 0 && (
            <span className="rounded-full bg-accentBlue px-1.5 text-[10px] font-semibold text-white tabular-nums">{nEscolhidos}</span>
          )}
        </button>

        {algumFiltro && (
          <button
            type="button"
            onClick={() => { onCriancas('todos'); onSelecao({}) }}
            className="btn-press inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink"
          >
            <X className="h-3 w-3" />Limpar filtros
          </button>
        )}
      </div>

      {aberto && (
        <div className="card-surface p-4 space-y-4">
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            {grupos.filter(g => g.opcoes.length > 0).map(g => (
              <fieldset key={g.id} className="space-y-1.5 min-w-0">
                <legend className="label-micro mb-1.5">{g.label}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {g.opcoes.map(([valor, n]) => {
                    const ativo = selecao[g.id]?.includes(valor) ?? false
                    return (
                      <button
                        key={valor}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => alternar(g.id, valor)}
                        className={cn(
                          'btn-press inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] leading-none transition-colors',
                          ativo
                            ? 'border-surface-inverse bg-surface-inverse text-ink-inverse'
                            : 'border-line text-ink-secondary hover:bg-surface-subtle hover:text-ink',
                        )}
                      >
                        {valor}
                        <span className={cn('tabular-nums', ativo ? 'opacity-70' : 'text-ink-muted')}>{n}</span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <p className="text-[11.5px] text-ink-muted leading-relaxed border-t border-line pt-3">
            Do perfil que o professor preencheu no onboarding do King:{' '}
            <span className="tabular-nums text-ink-secondary">{contagem.responderam}</span> de{' '}
            <span className="tabular-nums text-ink-secondary">{perfis.length}</span> nesta lista responderam.
            Quem não respondeu sai da lista quando há preferência escolhida.
            Em público, níveis, idiomas e nas outras listas, o professor precisa ter marcado todas as opções escolhidas.
          </p>
        </div>
      )}
    </div>
  )
}
