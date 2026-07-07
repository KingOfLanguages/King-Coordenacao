import { Button } from '@/components/ui/button'
import { Check, X, ShieldCheck, Mail, CalendarDays } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface Aprovacao {
  id: string
  email: string
  nome: string
  role_solicitada: string
  status: string
  created_at: string
  user_id: string
}

function useAprovacoesPendentes() {
  return useQuery({
    queryKey: ['aprovacoes', 'pendentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_approvals')
        .select('*')
        .eq('status', 'pendente')
        .order('created_at')
      if (error) throw error
      return data as Aprovacao[]
    },
  })
}

export function AprovacoesPage() {
  const queryClient = useQueryClient()
  const { data: aprovacoes, isLoading } = useAprovacoesPendentes()

  const processar = useMutation({
    mutationFn: async ({ aprovacao, acao, role }: {
      aprovacao: Aprovacao
      acao: 'aprovado' | 'rejeitado'
      role?: string
    }) => {
      const { error: e1 } = await supabase
        .from('pending_approvals')
        .update({ status: acao })
        .eq('id', aprovacao.id)
      if (e1) throw e1

      if (acao === 'aprovado') {
        const { error: e2 } = await supabase
          .from('profiles')
          .update({ role: role ?? aprovacao.role_solicitada, ativo: true })
          .eq('id', aprovacao.user_id)
        if (e2) throw e2
      }
    },
    onSuccess: (_data, vars) => {
      toast.success(`Acesso ${vars.acao} para ${vars.aprovacao.nome}.`)
      queryClient.invalidateQueries({ queryKey: ['aprovacoes'] })
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? `Erro ao processar: ${e.message}` : 'Erro ao processar a solicitação.')
    },
  })

  const total = aprovacoes?.length ?? 0

  return (
    <div className="px-6 py-6 max-w-3xl mx-auto space-y-5">
      <header className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Aprovações de acesso</h1>
          <p className="text-[13px] text-ink-muted">
            <span className="tabular-nums text-ink-secondary font-medium">{total}</span>{' '}
            solicitaç{total === 1 ? 'ão' : 'ões'} pendente{total === 1 ? '' : 's'}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-urg-medBg px-3 py-1 text-[11px] font-medium text-urg-medFg">
          <ShieldCheck className="h-3.5 w-3.5" />
          Admin
        </span>
      </header>

      {isLoading ? (
        <div className="card-surface p-12 text-center text-[13px] text-ink-muted">Carregando…</div>
      ) : total === 0 ? (
        <div className="card-surface p-12 text-center space-y-2">
          <div className="mx-auto h-10 w-10 rounded-full bg-urg-lowBg text-urg-lowFg flex items-center justify-center">
            <Check className="h-5 w-5" />
          </div>
          <p className="text-[14px] font-medium text-ink">Tudo em dia</p>
          <p className="text-[13px] text-ink-muted">Nenhuma solicitação pendente no momento.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {aprovacoes!.map(apr => (
            <li key={apr.id} className="card-surface p-5 animate-fade-up">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0 space-y-1.5">
                  <p className="font-semibold text-ink text-[14px] truncate">{apr.nome}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
                    <span className="inline-flex items-center gap-1 truncate">
                      <Mail className="h-3 w-3" />
                      {apr.email}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {new Date(apr.created_at).toLocaleDateString('pt-BR')}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-surface-subtle px-2 py-0.5 text-ink-secondary font-medium">
                      Solicitou · {apr.role_solicitada}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 sm:flex-shrink-0">
                  <Button
                    size="sm"
                    className="btn-press bg-urg-lowFg text-white hover:bg-urg-lowFg/90 gap-1"
                    disabled={processar.isPending}
                    onClick={() => processar.mutate({ aprovacao: apr, acao: 'aprovado' })}
                  >
                    <Check className="h-3.5 w-3.5" /> Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="btn-press border-line text-ink-secondary hover:bg-surface-subtle gap-1"
                    disabled={processar.isPending}
                    onClick={() => processar.mutate({ aprovacao: apr, acao: 'rejeitado' })}
                  >
                    <X className="h-3.5 w-3.5" /> Rejeitar
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
