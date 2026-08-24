import { useState } from 'react'
import type { ParticipanteReuniao } from '../shared/types'

// Chamada de presença da reunião em grupo. Visual vem da folha do painel
// (./estilos.ts) — aqui só classes, nada de estilo inline como antes.

export function GrupoParticipantes({
  participantes: initialParticipantes,
  observacaoComum,
  onSalvar,
}: {
  participantes: ParticipanteReuniao[]
  observacaoComum: string | null
  onSalvar: (presentes: string[], observacao: string) => Promise<void>
}) {
  const [participantes, setParticipantes] = useState<ParticipanteReuniao[]>(
    initialParticipantes.map(p => ({ ...p, presente: p.status === 'realizada' }))
  )
  const [observacao, setObservacao] = useState(observacaoComum ?? '')
  const [salvando, setSalvando] = useState(false)

  function togglePresente(reuniaoProfessorId: string) {
    setParticipantes(prev =>
      prev.map(p => p.reuniao_professor_id === reuniaoProfessorId ? { ...p, presente: !p.presente } : p)
    )
  }

  async function salvarConfirmacao() {
    setSalvando(true)
    try {
      const presentesIds = participantes.filter(p => p.presente).map(p => p.reuniao_professor_id)
      await onSalvar(presentesIds, observacao)
    } finally {
      setSalvando(false)
    }
  }

  const presentes = participantes.filter(p => p.presente).length

  return (
    <div>
      <div className="ktm-cartao-topo">
        <span className="ktm-rotulo">Presença</span>
        <span className="ktm-selo-chip">{presentes} de {participantes.length}</span>
      </div>

      <ul className="ktm-lista">
        {participantes.map(p => (
          <li key={p.reuniao_professor_id} className="ktm-item">
            <button
              className={`ktm-check${p.presente ? ' ktm-check--on' : ''}`}
              onClick={() => togglePresente(p.reuniao_professor_id)}
              title={p.presente ? 'Marcar ausente' : 'Marcar presente'}
              aria-pressed={p.presente}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor"
                      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="ktm-item-nome" style={{ flex: 1 }}>{p.professor_nome}</span>
            {p.status === 'cancelada' && <span className="ktm-selo-chip ktm-selo-chip--vermelho">Cancelada</span>}
          </li>
        ))}
      </ul>

      <textarea
        className="ktm-area"
        style={{ marginTop: 10 }}
        value={observacao}
        onChange={e => setObservacao(e.target.value)}
        placeholder="Notas sobre a reunião de grupo…"
      />

      <button onClick={salvarConfirmacao} disabled={salvando} className="ktm-btn ktm-btn--ok ktm-btn--bloco" style={{ marginTop: 9 }}>
        {salvando ? 'Salvando…' : 'Confirmar presença'}
      </button>
    </div>
  )
}
