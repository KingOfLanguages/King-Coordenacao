import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useIncidente, useAtualizarIncidente } from '@/hooks/useIncidentes'
import { IncidenteStatusBadge } from '@/components/incidentes/IncidenteStatusBadge'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

export function IncidenteDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: incidente, isLoading } = useIncidente(id!)
  const atualizar = useAtualizarIncidente()
  const [editando, setEditando] = useState(false)
  const [descricao, setDescricao] = useState('')

  const isAdmin   = profile?.role === 'admin'
  const isSuporte = profile?.role === 'suporte' || isAdmin

  if (isLoading) return (
    <div className="flex h-64 items-center justify-center text-white/50">Carregando...</div>
  )
  if (!incidente) return (
    <div className="flex h-64 items-center justify-center text-white/50">Incidente não encontrado.</div>
  )

  async function handleStatus(status: 'aprovado' | 'rejeitado') {
    await atualizar.mutateAsync({ id: id!, status })
    toast.success(`Incidente ${status}.`)
  }

  async function handleSalvarEdicao() {
    await atualizar.mutateAsync({ id: id!, descricao })
    toast.success('Incidente atualizado.')
    setEditando(false)
  }

  return (
    <div className="space-y-6 p-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/incidentes')}
          className="text-white/50 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{incidente.tipo}</h1>
          <IncidenteStatusBadge status={incidente.status} />
        </div>
        {isAdmin && incidente.status === 'pendente' && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline"
              className="border-green-700 text-green-400 hover:bg-green-700/20 gap-1"
              onClick={() => handleStatus('aprovado')}
              disabled={atualizar.isPending}>
              <Check className="h-3 w-3" /> Aprovar
            </Button>
            <Button size="sm" variant="outline"
              className="border-zinc-700 text-zinc-400 hover:bg-zinc-700/20 gap-1"
              onClick={() => handleStatus('rejeitado')}
              disabled={atualizar.isPending}>
              <X className="h-3 w-3" /> Rejeitar
            </Button>
          </div>
        )}
      </div>

      <Card className="bg-king-card border-king-border p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-white/40 mb-1">Professor</p>
            <p className="text-white">{(incidente as any).professores?.nome ?? '—'}</p>
          </div>
          <div>
            <p className="text-white/40 mb-1">Registrado por</p>
            <p className="text-white">{(incidente as any).criador?.nome ?? '—'}</p>
          </div>
          <div>
            <p className="text-white/40 mb-1">Data</p>
            <p className="text-white">
              {new Date(incidente.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'long', year: 'numeric'
              })}
            </p>
          </div>
          {(incidente as any).aprovador && (
            <div>
              <p className="text-white/40 mb-1">Aprovado/Rejeitado por</p>
              <p className="text-white">{(incidente as any).aprovador.nome}</p>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-white/40 text-sm">Descrição</p>
            {isSuporte && !editando && incidente.status === 'pendente' && (
              <Button variant="ghost" size="sm" className="text-white/40 hover:text-white h-auto py-0"
                onClick={() => { setDescricao(incidente.descricao); setEditando(true) }}>
                Editar
              </Button>
            )}
          </div>
          {editando ? (
            <div className="space-y-2">
              <textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-king-border bg-king-dark px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-king-red"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setEditando(false)} className="text-white/50">
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSalvarEdicao} disabled={atualizar.isPending}
                  className="bg-king-red hover:bg-king-red/90">
                  Salvar
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-white/80 text-sm leading-relaxed">{incidente.descricao}</p>
          )}
        </div>

        {incidente.imagens && incidente.imagens.length > 0 && (
          <div>
            <p className="text-white/40 text-sm mb-2">Imagens</p>
            <div className="flex flex-wrap gap-2">
              {incidente.imagens.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt={`imagem-${i}`}
                    className="h-20 w-20 rounded object-cover border border-king-border hover:border-king-red transition-colors" />
                </a>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
