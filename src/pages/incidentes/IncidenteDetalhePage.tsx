import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, X, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIncidente, useAtualizarIncidente } from '@/hooks/useIncidentes'
import { IncidenteStatusBadge, UrgencyBadge, urgencyFromIncidente } from '@/components/incidentes/IncidenteStatusBadge'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

export function IncidenteDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: incidente, isLoading } = useIncidente(id!)
  const atualizar = useAtualizarIncidente()
  const [editando, setEditando]         = useState(false)
  const [descricao, setDescricao]       = useState('')
  const [solucao, setSolucao]           = useState('')
  const [responsavel, setResponsavel]   = useState('')

  const isAdmin   = profile?.role === 'admin'
  const isSuporte = profile?.role === 'suporte' || isAdmin

  if (isLoading)   return <div className="flex h-64 items-center justify-center text-ink-muted">Carregando…</div>
  if (!incidente)  return <div className="flex h-64 items-center justify-center text-ink-muted">Incidente não encontrado.</div>

  async function handleStatus(status: 'aprovado' | 'rejeitado') {
    await atualizar.mutateAsync({ id: id!, status })
    toast.success(`Incidente ${status}.`)
  }

  async function handleSalvarEdicao() {
    await atualizar.mutateAsync({
      id: id!,
      descricao,
      solucao:     solucao.trim() || undefined,
      responsavel: responsavel.trim() || undefined,
    })
    toast.success('Incidente atualizado.')
    setEditando(false)
  }

  const urgency = urgencyFromIncidente(incidente)
  const professor = (incidente as { professores?: { nome: string } | null }).professores
  const criador   = (incidente as { criador?: { nome: string } | null }).criador
  const aprovador = (incidente as { aprovador?: { nome: string } | null }).aprovador

  return (
    <div className="px-6 py-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/incidentes')}
          className="btn-press text-ink-secondary hover:text-ink hover:bg-surface-subtle">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{incidente.tipo}</h1>
            <UrgencyBadge level={urgency} />
            <IncidenteStatusBadge status={incidente.status} />
          </div>
        </div>
        {isAdmin && incidente.status === 'pendente' && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline"
              className="btn-press border-urg-lowFg/40 text-urg-lowFg hover:bg-urg-lowBg gap-1"
              onClick={() => handleStatus('aprovado')}
              disabled={atualizar.isPending}>
              <Check className="h-3.5 w-3.5" /> Resolver
            </Button>
            <Button size="sm" variant="outline"
              className="btn-press border-line text-ink-secondary hover:bg-surface-subtle gap-1"
              onClick={() => handleStatus('rejeitado')}
              disabled={atualizar.isPending}>
              <X className="h-3.5 w-3.5" /> Rejeitar
            </Button>
          </div>
        )}
      </div>

      <section className="card-surface p-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
          <div className="space-y-0.5">
            <p className="label-micro">Professor</p>
            <p className="text-ink">{professor?.nome ?? '—'}</p>
          </div>
          <div className="space-y-0.5">
            <p className="label-micro">Registrado por</p>
            <p className="text-ink">{criador?.nome ?? '—'}</p>
          </div>
          <div className="space-y-0.5">
            <p className="label-micro">Responsável</p>
            <p className="text-ink">{incidente.responsavel ?? '—'}</p>
          </div>
          <div className="space-y-0.5">
            <p className="label-micro">Data</p>
            <p className="text-ink tabular-nums">
              {new Date(incidente.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'short', year: 'numeric'
              })}
            </p>
          </div>
          {incidente.precisa_acompanhamento && (
            <div className="col-span-2 md:col-span-4 inline-flex items-center gap-1.5 rounded-md bg-urg-medBg px-2.5 py-1 w-fit">
              <span className="h-1.5 w-1.5 rounded-full bg-urg-medFg" />
              <span className="text-[12px] font-medium text-urg-medFg">Acompanhamento pendente</span>
            </div>
          )}
          {aprovador && (
            <div className="space-y-0.5">
              <p className="label-micro">Decisão por</p>
              <p className="text-ink">{aprovador.nome}</p>
            </div>
          )}
        </div>

        {incidente.solucao && !editando && (
          <div className="space-y-1.5">
            <p className="label-micro">Solução aplicada</p>
            <p className="text-[14px] text-ink-secondary leading-relaxed whitespace-pre-wrap">{incidente.solucao}</p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="label-micro">Descrição</p>
            {isSuporte && !editando && incidente.status === 'pendente' && (
              <button
                className="btn-press text-[12px] text-ink-secondary hover:text-ink inline-flex items-center gap-1"
                onClick={() => {
                  setDescricao(incidente.descricao)
                  setSolucao(incidente.solucao ?? '')
                  setResponsavel(incidente.responsavel ?? '')
                  setEditando(true)
                }}
              >
                <Pencil className="h-3 w-3" />
                Editar
              </button>
            )}
          </div>
          {editando ? (
            <div className="space-y-3">
              <textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue"
                placeholder="Descrição do incidente…"
              />
              <textarea
                value={solucao}
                onChange={e => setSolucao(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue"
                placeholder="Solução aplicada (opcional)…"
              />
              <input
                value={responsavel}
                onChange={e => setResponsavel(e.target.value)}
                className="w-full rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue"
                placeholder="Responsável (opcional)…"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setEditando(false)} className="text-ink-secondary">
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSalvarEdicao} disabled={atualizar.isPending}
                  className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white">
                  Salvar
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[14px] text-ink-secondary leading-relaxed whitespace-pre-wrap">{incidente.descricao}</p>
          )}
        </div>

        {incidente.imagens && incidente.imagens.length > 0 && (
          <div className="space-y-2">
            <p className="label-micro">Imagens</p>
            <div className="flex flex-wrap gap-2">
              {incidente.imagens.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="btn-press">
                  <img src={url} alt={`Anexo ${i + 1}`}
                    className="h-20 w-20 rounded-md object-cover border border-line hover:border-line-strong transition-colors" />
                </a>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
