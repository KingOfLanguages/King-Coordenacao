import { useState, useMemo } from 'react'
import { Search, ShieldCheck, UserCheck, UserX, Info, Trash2, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useUsuarios, useAtualizarUsuario, useExcluirUsuario } from '@/hooks/useUsuarios'
import type { UsuarioAdmin } from '@/hooks/useUsuarios'
import type { RoleUsuario } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const ROLES: { value: RoleUsuario; label: string }[] = [
  { value: 'admin',         label: 'Admin' },
  { value: 'coordenacao',   label: 'Coordenação' },
  { value: 'suporte',       label: 'Suporte' },
  { value: 'suporte_aluno', label: 'Suporte · Aluno' },
]

function roleLabel(role: RoleUsuario) {
  return ROLES.find(r => r.value === role)?.label ?? role
}

export function UsuariosPage() {
  const { profile } = useAuth()
  const { data: usuarios, isLoading } = useUsuarios()
  const atualizar = useAtualizarUsuario()
  const excluir   = useExcluirUsuario()
  const [busca, setBusca]           = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null) // id do usuário pendente de confirmação

  const filtrados = useMemo(() =>
    (usuarios ?? []).filter(u =>
      u.nome.toLowerCase().includes(busca.toLowerCase())
    ), [usuarios, busca])

  const ativos    = filtrados.filter(u => u.ativo).length
  const bloqueados = filtrados.filter(u => !u.ativo).length

  async function handleRole(usuario: UsuarioAdmin, role: RoleUsuario) {
    try {
      await atualizar.mutateAsync({ id: usuario.id, role })
      toast.success(`Perfil de ${usuario.nome} atualizado para ${roleLabel(role)}.`)
    } catch {
      toast.error('Erro ao atualizar perfil.')
    }
  }

  async function handleToggleAtivo(usuario: UsuarioAdmin) {
    const novo = !usuario.ativo
    try {
      await atualizar.mutateAsync({ id: usuario.id, ativo: novo })
      toast.success(
        novo
          ? `Acesso de ${usuario.nome} reativado.`
          : `Conta de ${usuario.nome} bloqueada.`
      )
    } catch {
      toast.error('Erro ao atualizar status.')
    }
  }

  async function handleExcluir(usuario: UsuarioAdmin) {
    try {
      await excluir.mutateAsync(usuario.id)
      toast.success(`Conta de ${usuario.nome} excluída permanentemente.`)
      setConfirmDelete(null)
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Erro desconhecido'
      toast.error(`Erro ao excluir: ${msg}`)
      setConfirmDelete(null)
    }
  }

  return (
    <div className="px-6 py-6 max-w-[1100px] mx-auto space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Usuários internos</h1>
          <p className="text-[13px] text-ink-muted">
            <span className="tabular-nums text-ink-secondary font-medium">{ativos}</span> ativo{ativos !== 1 ? 's' : ''}
            {bloqueados > 0 && (
              <> · <span className="text-urg-highFg font-medium">{bloqueados} bloqueado{bloqueados !== 1 ? 's' : ''}</span></>
            )}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-urg-medBg px-3 py-1 text-[11px] font-medium text-urg-medFg">
          <ShieldCheck className="h-3.5 w-3.5" />
          Admin
        </span>
      </header>

      {/* Onboarding info */}
      <div className="flex items-start gap-3 rounded-lg border border-accentBlue/20 bg-accentBlue-soft/10 px-4 py-3">
        <Info className="h-4 w-4 text-accentBlue flex-shrink-0 mt-0.5" />
        <div className="text-[13px] text-accentBlue/90 space-y-0.5">
          <p className="font-medium text-accentBlue">Como adicionar novos membros</p>
          <p>
            Novos usuários se cadastram em <code className="font-mono text-[12px]">/cadastro</code> e
            aguardam aprovação em{' '}
            <a href="/admin/aprovacoes" className="underline underline-offset-2 hover:text-accentBlue">
              Aprovações de acesso
            </a>
            .
          </p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
        <Input
          placeholder="Buscar por nome…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="pl-9 h-9 bg-surface-canvas border-line"
        />
      </div>

      {/* Tabela */}
      {isLoading ? (
        <SkeletonList />
      ) : filtrados.length === 0 ? (
        <div className="card-surface p-10 text-center">
          <p className="text-[14px] font-medium text-ink">Nenhum usuário encontrado</p>
          <p className="text-[13px] text-ink-muted mt-1">Ajuste o filtro de busca.</p>
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          {/* Cabeçalho */}
          <div className="hidden sm:grid grid-cols-[1fr_170px_110px_80px_180px] gap-4 px-5 py-2.5 border-b border-line-soft bg-surface-subtle/60">
            <span className="label-micro">Nome</span>
            <span className="label-micro">Perfil</span>
            <span className="label-micro">Status</span>
            <span className="label-micro">Desde</span>
            <span className="label-micro text-right">Ações</span>
          </div>

          <ul className="divide-y divide-line-soft">
            {filtrados.map(u => (
              <UsuarioRow
                key={u.id}
                usuario={u}
                isSelf={u.id === profile?.id}
                onRole={role => handleRole(u, role)}
                onToggleAtivo={() => handleToggleAtivo(u)}
                onExcluir={() => handleExcluir(u)}
                confirmingDelete={confirmDelete === u.id}
                onRequestDelete={() => setConfirmDelete(u.id)}
                onCancelDelete={() => setConfirmDelete(null)}
                isPending={atualizar.isPending || excluir.isPending}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function UsuarioRow({
  usuario, isSelf, onRole, onToggleAtivo, onExcluir,
  confirmingDelete, onRequestDelete, onCancelDelete, isPending,
}: {
  usuario: UsuarioAdmin
  isSelf: boolean
  onRole: (role: RoleUsuario) => void
  onToggleAtivo: () => void
  onExcluir: () => void
  confirmingDelete: boolean
  onRequestDelete: () => void
  onCancelDelete: () => void
  isPending: boolean
}) {
  const initials = usuario.nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  return (
    <li className={cn(
      'grid sm:grid-cols-[1fr_170px_110px_80px_180px] gap-4 px-5 py-3.5 items-center transition-opacity',
      !usuario.ativo && 'opacity-55',
    )}>
      {/* Nome */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accentBlue-soft text-accentBlue text-[11px] font-semibold select-none">
          {initials}
        </span>
        <span className="text-[13px] font-medium text-ink truncate">{usuario.nome}</span>
      </div>

      {/* Perfil */}
      <div>
        <Select
          value={usuario.role}
          onValueChange={v => onRole(v as RoleUsuario)}
          disabled={isPending}
        >
          <SelectTrigger className="h-8 text-[12px] bg-surface-canvas border-line text-ink w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-surface-canvas border-line text-ink">
            {ROLES.map(r => (
              <SelectItem key={r.value} value={r.value} className="text-[12px]">
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status */}
      <div>
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
          usuario.ativo
            ? 'bg-urg-lowBg text-urg-lowFg'
            : 'bg-urg-highBg text-urg-highFg',
        )}>
          <span className={cn(
            'h-1.5 w-1.5 rounded-full flex-shrink-0',
            usuario.ativo ? 'bg-urg-lowFg' : 'bg-urg-highFg',
          )} />
          {usuario.ativo ? 'Ativo' : 'Bloqueado'}
        </span>
      </div>

      {/* Data */}
      <span className="hidden sm:block text-[12px] text-ink-muted tabular-nums">
        {new Date(usuario.created_at).toLocaleDateString('pt-BR', {
          day: '2-digit', month: 'short',
        })}
      </span>

      {/* Ações */}
      <div className="flex justify-end items-center gap-1.5">
        {confirmingDelete ? (
          /* Confirmação inline */
          <div className="flex items-center gap-1.5 rounded-lg border border-urg-highFg/30 bg-urg-highBg px-2.5 py-1.5">
            <AlertTriangle className="h-3 w-3 text-urg-highFg flex-shrink-0" />
            <span className="text-[11px] text-urg-highFg font-medium">Confirmar?</span>
            <button
              onClick={onExcluir}
              disabled={isPending}
              className="btn-press text-[11px] font-semibold text-urg-highFg hover:underline"
            >
              Sim
            </button>
            <span className="text-urg-highFg/40">·</span>
            <button
              onClick={onCancelDelete}
              className="btn-press text-[11px] text-ink-muted hover:text-ink"
            >
              Não
            </button>
          </div>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={onToggleAtivo}
              className={cn(
                'btn-press h-7 text-[11px] gap-1.5',
                usuario.ativo
                  ? 'border-urg-highFg/25 text-urg-highFg hover:bg-urg-highBg'
                  : 'border-urg-lowFg/25 text-urg-lowFg hover:bg-urg-lowBg',
              )}
            >
              {usuario.ativo
                ? <><UserX className="h-3 w-3" />Bloquear</>
                : <><UserCheck className="h-3 w-3" />Reativar</>
              }
            </Button>

            {!isSelf && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={onRequestDelete}
                className="btn-press h-7 w-7 p-0 border-line text-ink-muted hover:border-urg-highFg/30 hover:text-urg-highFg hover:bg-urg-highBg"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <div className="card-surface overflow-hidden divide-y divide-line-soft">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
          <div className="h-8 w-8 rounded-full bg-surface-subtle flex-shrink-0" />
          <div className="h-4 w-44 rounded bg-surface-subtle" />
          <div className="ml-auto flex gap-3">
            <div className="h-8 w-28 rounded bg-surface-subtle" />
            <div className="h-7 w-20 rounded bg-surface-subtle" />
          </div>
        </div>
      ))}
    </div>
  )
}
