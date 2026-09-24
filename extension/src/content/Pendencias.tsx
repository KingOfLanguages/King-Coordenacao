import { useState } from 'react'
import type { NexusOcorrencia, ObservacaoResumo } from '../shared/types'

// Concluir pendências sem sair da chamada: o botão de um chamado (aba Registros)
// e a lista que aparece quando a reunião vira "realizada". As duas superfícies
// falam com o background pela mesma mensagem (CONCLUIR_PENDENCIAS).

/** Devolve a mensagem de erro, ou null quando deu certo. */
export type Concluir = (chamados: { id: string; solucao: string }[], ocorrencias: string[]) => Promise<string | null>

/** Chamado que está com a TI fecha do lado de lá — aqui o botão não aparece. */
function chamadoComTi(c: NexusOcorrencia): boolean {
  return !!c.ti_status
}

function dataCurta(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const IconeCheck = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** "Concluir" de um chamado: abre o campo de solução (obrigatório, igual à web). */
export function ConcluirChamado({ chamado, onConcluir }: { chamado: NexusOcorrencia; onConcluir: Concluir }) {
  const [aberto, setAberto] = useState(false)
  const [solucao, setSolucao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (chamadoComTi(chamado)) {
    return <p className="ktm-txt-3" style={{ marginTop: 7 }}>Está com a TI — conclui por lá.</p>
  }

  if (!aberto) {
    return (
      <button className="ktm-linkbtn" style={{ marginTop: 7 }} onClick={() => setAberto(true)}>Concluir</button>
    )
  }

  async function confirmar() {
    setSalvando(true); setErro(null)
    const e = await onConcluir([{ id: chamado.id, solucao }], [])
    setSalvando(false)
    if (e) setErro(e)
    else { setAberto(false); setSolucao('') }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <textarea className="ktm-area" value={solucao} onChange={e => setSolucao(e.target.value)}
                placeholder="Como foi resolvido…" autoFocus />
      <div className="ktm-acoes">
        <button onClick={confirmar} disabled={salvando || !solucao.trim()} className="ktm-btn ktm-btn--ok">
          {salvando ? 'Salvando…' : 'Concluir chamado'}
        </button>
        <button onClick={() => { setAberto(false); setSolucao(''); setErro(null) }} className="ktm-btn">Cancelar</button>
      </div>
      {erro && <p className="ktm-erro">{erro}</p>}
    </div>
  )
}

/**
 * Lista pós-reunião: o que está em aberto sobre o professor, pra fechar o que a
 * conversa resolveu. Nada vem marcado — reunião não resolve chamado sozinha; o
 * coordenador escolhe. Uma solução só vale para todos os chamados marcados
 * (ocorrência do KTM não tem campo de solução).
 */
export function PendenciasPosReuniao({ chamados, ocorrencias, onConcluir, onDispensar }: {
  chamados: NexusOcorrencia[]
  ocorrencias: ObservacaoResumo[]
  onConcluir: Concluir
  onDispensar: () => void
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [solucao, setSolucao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const elegiveis = chamados.filter(c => !chamadoComTi(c))
  const comTi = chamados.length - elegiveis.length
  if (!elegiveis.length && !ocorrencias.length) return null

  const chamadosMarcados = elegiveis.filter(c => marcados.has(c.id))
  const ocorrenciasMarcadas = ocorrencias.filter(o => marcados.has(o.id))
  const total = chamadosMarcados.length + ocorrenciasMarcadas.length
  const faltaSolucao = chamadosMarcados.length > 0 && !solucao.trim()

  function alternar(id: string) {
    setMarcados(prev => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  async function concluir() {
    setSalvando(true); setErro(null)
    const e = await onConcluir(
      chamadosMarcados.map(c => ({ id: c.id, solucao })),
      ocorrenciasMarcadas.map(o => o.id),
    )
    setSalvando(false)
    if (e) setErro(e)
    else { setMarcados(new Set()); setSolucao('') }
  }

  const linha = (id: string, rotulo: string, texto: string, data: string) => (
    <li key={id} className="ktm-item" style={{ alignItems: 'flex-start' }}>
      <button className={`ktm-check${marcados.has(id) ? ' ktm-check--on' : ''}`} onClick={() => alternar(id)}
              title={marcados.has(id) ? 'Desmarcar' : 'Marcar para concluir'} aria-pressed={marcados.has(id)}>
        <IconeCheck />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ktm-registro-topo"><span>{rotulo}</span><span>{dataCurta(data)}</span></div>
        <p className="ktm-registro-txt" style={{ marginTop: 2 }}>{texto}</p>
      </div>
    </li>
  )

  return (
    <div style={{ marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--fio)' }}>
      <div className="ktm-cartao-topo">
        <span className="ktm-rotulo">Resolveu algo na conversa?</span>
        <button className="ktm-linkbtn" onClick={onDispensar}>Agora não</button>
      </div>
      <ul className="ktm-lista">
        {elegiveis.map(c => linha(c.id, `Chamado · ${c.problem_type}`, c.description, c.created_at))}
        {ocorrencias.map(o => linha(o.id, 'Ocorrência', o.texto, o.created_at))}
      </ul>
      {comTi > 0 && <p className="ktm-txt-3" style={{ marginTop: 4 }}>{comTi} chamado(s) com a TI ficam de fora — concluem por lá.</p>}

      {chamadosMarcados.length > 0 && (
        <textarea className="ktm-area" style={{ marginTop: 9 }} value={solucao} onChange={e => setSolucao(e.target.value)}
                  placeholder={chamadosMarcados.length > 1 ? 'Solução (vale para os chamados marcados)…' : 'Como foi resolvido…'} />
      )}
      <button onClick={concluir} disabled={salvando || total === 0 || faltaSolucao}
              className="ktm-btn ktm-btn--ok ktm-btn--bloco" style={{ marginTop: 9 }}>
        {salvando ? 'Salvando…' : total ? `Concluir selecionados (${total})` : 'Marque o que foi resolvido'}
      </button>
      {erro && <p className="ktm-erro">{erro}</p>}
    </div>
  )
}
