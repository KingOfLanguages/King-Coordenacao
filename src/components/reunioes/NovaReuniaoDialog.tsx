import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { X, Search, User, Users2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCriarReuniao, useDadosVinculo } from '@/hooks/useReunioesDia'
import { cn } from '@/lib/utils'

type Tipo = 'professor' | 'interna'

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const parseEmails = (s: string) =>
  s.split(/[\s,;]+/).map(t => t.trim()).filter(t => t.includes('@'))

function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Cadastro manual de reunião — professor (vincula 1 professor, com merge por dia)
// ou interna (equipe/liderança). Cria na área do coordenador informado.
export function NovaReuniaoDialog({ coordenadorId, dataRef, onClose }: {
  coordenadorId: string
  dataRef: Date
  onClose: () => void
}) {
  const criar = useCriarReuniao()
  const { data: dados } = useDadosVinculo()

  const [tipo, setTipo]                 = useState<Tipo>('professor')
  const [busca, setBusca]               = useState('')
  const [prof, setProf]                 = useState<{ id: string; nome: string } | null>(null)
  const [data, setData]                 = useState(() => toDateInput(dataRef))
  const [hora, setHora]                 = useState('09:00')
  const [titulo, setTitulo]             = useState('')
  const [link, setLink]                 = useState('')
  const [observacao, setObservacao]     = useState('')
  const [pauta, setPauta]               = useState('')
  const [participantes, setParticipantes] = useState('')

  const resultados = useMemo(() => {
    const q = norm(busca)
    if (!q) return []
    return (dados?.profs ?? []).filter(p => norm(p.nome).includes(q)).slice(0, 8)
  }, [busca, dados])

  async function handleSalvar() {
    if (!data) { toast.error('Selecione uma data.'); return }
    if (tipo === 'professor' && !prof) { toast.error('Selecione o professor.'); return }
    const dataISO = new Date(`${data}T${hora || '00:00'}:00`).toISOString()
    try {
      const res = await criar.mutateAsync({
        tipo,
        coordenadorId,
        dataISO,
        titulo: titulo || null,
        meetLink: link || null,
        professorId: prof?.id ?? null,
        pauta: tipo === 'interna' ? pauta : null,
        participantesEmails: tipo === 'interna' ? parseEmails(participantes) : undefined,
        observacao: tipo === 'professor' ? observacao : null,
      })
      toast.success(res.merged
        ? 'Já havia uma reunião com esse professor nesse dia — juntei na existente.'
        : 'Reunião criada.')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar reunião.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-canvas border border-line rounded-xl shadow-elevated w-full max-w-md mx-4 p-6 space-y-5 animate-fade-up max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">Nova reunião</h2>
          <button onClick={onClose} className="btn-press text-ink-subtle hover:text-ink-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tipo */}
        <div className="flex items-center gap-1 bg-surface-subtle rounded-full p-1 w-fit">
          {([['professor', 'Com professor', User], ['interna', 'Interna', Users2]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTipo(id)}
              className={cn(
                'btn-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors',
                tipo === id ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {/* Professor (busca) */}
          {tipo === 'professor' && (
            <div className="space-y-1.5">
              <Label className="label-micro">Professor <span className="text-brand">*</span></Label>
              {prof ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-subtle px-3 py-2">
                  <span className="text-[13px] font-medium text-ink truncate">{prof.nome}</span>
                  <button onClick={() => { setProf(null); setBusca('') }} className="btn-press text-[11px] text-accentBlue hover:underline flex-shrink-0">
                    trocar
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
                  <Input
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar professor…"
                    className="pl-9 h-9 bg-surface-canvas border-line"
                  />
                  {resultados.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto rounded-md border border-line bg-surface-canvas shadow-elevated">
                      {resultados.map(p => (
                        <button
                          key={p.id}
                          onClick={() => setProf({ id: p.id, nome: p.nome })}
                          className="btn-press block w-full text-left px-3 py-2 text-[13px] text-ink hover:bg-surface-subtle"
                        >
                          {p.nome}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Data + hora */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="label-micro">Data <span className="text-brand">*</span></Label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} className="h-9 bg-surface-canvas border-line" />
            </div>
            <div className="space-y-1.5">
              <Label className="label-micro">Horário</Label>
              <Input type="time" value={hora} onChange={e => setHora(e.target.value)} className="h-9 bg-surface-canvas border-line" />
            </div>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <Label className="label-micro">Título (opcional)</Label>
            <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder={tipo === 'interna' ? 'Ex: Alinhamento da equipe' : 'Ex: 1:1 com o teacher'} className="h-9 bg-surface-canvas border-line" />
          </div>

          {/* Link */}
          <div className="space-y-1.5">
            <Label className="label-micro">Link (opcional)</Label>
            <Input value={link} onChange={e => setLink(e.target.value)} placeholder="https://meet.google.com/…" className="h-9 bg-surface-canvas border-line" />
          </div>

          {/* Específicos por tipo */}
          {tipo === 'professor' ? (
            <div className="space-y-1.5">
              <Label className="label-micro">Observação (opcional)</Label>
              <textarea
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                rows={2}
                placeholder="Observações da reunião…"
                className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
              />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="label-micro">Pauta (opcional)</Label>
                <textarea
                  value={pauta}
                  onChange={e => setPauta(e.target.value)}
                  rows={2}
                  placeholder="Assunto da reunião…"
                  className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="label-micro">Participantes (e-mails, opcional)</Label>
                <Input value={participantes} onChange={e => setParticipantes(e.target.value)} placeholder="fulano@king.com, ciclana@king.com" className="h-9 bg-surface-canvas border-line" />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-ink-secondary">Cancelar</Button>
          <Button
            size="sm"
            onClick={handleSalvar}
            disabled={criar.isPending}
            className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
          >
            {criar.isPending ? 'Criando…' : 'Criar reunião'}
          </Button>
        </div>
      </div>
    </div>
  )
}
