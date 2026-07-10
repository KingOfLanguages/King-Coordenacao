import { useState } from 'react'
import type { ParticipanteReuniao } from '../shared/types'

const C = {
  ink:       '#131316',
  inkMuted:  '#818290',
  border:    '#E5E5EA',
  green:     '#1A9C5F',
  greenSoft: '#E4F7EE',
  red:       '#C0272D',
  redSoft:   '#FBE7E7',
}

const botaoCheck = {
  width: '24px',
  height: '24px',
  borderRadius: '4px',
  border: `1px solid ${C.border}`,
  background: '#FFFFFF',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: '600',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.2s',
}

const botaoCheckActive = {
  ...botaoCheck,
  background: C.green,
  color: '#FFFFFF',
  border: `1px solid ${C.green}`,
}

const linhaParticipante = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 0',
  borderBottom: `1px solid ${C.border}`,
}

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

  const contPresentes = participantes.filter(p => p.presente).length
  const total = participantes.length

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, margin: '0 0 6px', textTransform: 'uppercase' }}>
          Presentes ({contPresentes}/{total})
        </p>

        <div style={{ background: '#F8FAFC', borderRadius: '6px', padding: '8px', marginBottom: 12 }}>
          {participantes.map(p => (
            <div key={p.reuniao_professor_id} style={linhaParticipante}>
              <button
                onClick={() => togglePresente(p.reuniao_professor_id)}
                style={p.presente ? botaoCheckActive : botaoCheck}
                title={p.presente ? 'Marcar ausente' : 'Marcar presente'}
              >
                {p.presente ? '✓' : ''}
              </button>
              <span style={{ fontSize: 13, color: C.ink, flexGrow: 1 }}>{p.professor_nome}</span>
              {p.status === 'cancelada' && (
                <span style={{ fontSize: 10, color: C.red, background: C.redSoft, padding: '2px 6px', borderRadius: '3px' }}>
                  Cancelada
                </span>
              )}
            </div>
          ))}
        </div>

        <label style={{ display: 'block', marginBottom: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, margin: '0 0 4px', textTransform: 'uppercase' }}>
            Observação comum
          </p>
          <textarea
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            placeholder="Notas sobre a reunião de grupo…"
            style={{
              width: '100%',
              minHeight: '60px',
              padding: '8px',
              borderRadius: '4px',
              border: `1px solid ${C.border}`,
              fontFamily: 'inherit',
              fontSize: '12px',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </label>

        <button
          onClick={salvarConfirmacao}
          disabled={salvando}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: C.green,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: salvando ? 'not-allowed' : 'pointer',
            opacity: salvando ? 0.6 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {salvando ? 'Salvando…' : 'Confirmar presença'}
        </button>
      </div>
    </div>
  )
}
