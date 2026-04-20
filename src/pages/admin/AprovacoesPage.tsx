import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, X } from 'lucide-react'
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
      await supabase
        .from('pending_approvals')
        .update({ status: acao })
        .eq('id', aprovacao.id)

      if (acao === 'aprovado') {
        await supabase
          .from('profiles')
          .update({ role: role ?? aprovacao.role_solicitada })
          .eq('id', aprovacao.user_id)
      }
    },
    onSuccess: (_data, vars) => {
      toast.success(`Acesso ${vars.acao} para ${vars.aprovacao.nome}.`)
      queryClient.invalidateQueries({ queryKey: ['aprovacoes'] })
    },
  })

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Aprovações de Acesso</h1>
        <p className="text-sm text-white/40 mt-0.5">
          {aprovacoes?.length ?? 0} solicitação{aprovacoes?.length !== 1 ? 'ões' : ''} pendente{aprovacoes?.length !== 1 ? 's' : ''}
        </p>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-white/40">Carregando...</div>
      ) : aprovacoes?.length === 0 ? (
        <Card className="bg-king-card border-king-border p-8 text-center">
          <p className="text-white/40">Nenhuma solicitação pendente.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {aprovacoes?.map(apr => (
            <Card key={apr.id} className="bg-king-card border-king-border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="font-semibold text-white">{apr.nome}</p>
                  <p className="text-sm text-white/40">{apr.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="border-king-border text-white/50 text-xs">
                      Solicitou: {apr.role_solicitada}
                    </Badge>
                    <span className="text-xs text-white/30">
                      {new Date(apr.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-green-700 text-green-400 hover:bg-green-700/20 gap-1"
                    disabled={processar.isPending}
                    onClick={() => processar.mutate({ aprovacao: apr, acao: 'aprovado' })}
                  >
                    <Check className="h-3 w-3" /> Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 text-zinc-400 hover:bg-zinc-700/20 gap-1"
                    disabled={processar.isPending}
                    onClick={() => processar.mutate({ aprovacao: apr, acao: 'rejeitado' })}
                  >
                    <X className="h-3 w-3" /> Rejeitar
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
