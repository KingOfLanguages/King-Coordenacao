import { useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { toast } from 'sonner'
import { Lightbulb } from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCriarProjeto } from '@/hooks/useProjetos'
import { TIPO_PROJETO, PRIORIDADE_META, type ProjetoPrioridade, type ProjetoTipo } from '@/lib/projetos'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

/** Sugestão de projeto. Nasce sempre como proposta — a liderança é que aprova. */
export function NovoProjetoDialog({ open, onOpenChange }: Props) {
  const criar = useCriarProjeto()

  const [titulo, setTitulo]         = useState('')
  const [descricao, setDescricao]   = useState('')
  const [tipo, setTipo]             = useState<ProjetoTipo>('sistema')
  const [impacto, setImpacto]       = useState('')
  const [prioridade, setPrioridade] = useState<ProjetoPrioridade>('media')
  const [dataEntrega, setDataEntrega] = useState('')

  const tipoInfo = TIPO_PROJETO.find(t => t.key === tipo)
  const valido = titulo.trim().length >= 4 && descricao.trim().length >= 10

  function limpar() {
    setTitulo(''); setDescricao(''); setTipo('sistema')
    setImpacto(''); setPrioridade('media'); setDataEntrega('')
  }

  async function enviar() {
    if (!valido) return
    try {
      await criar.mutateAsync({
        titulo, descricao, tipo, impacto,
        prioridade,
        data_entrega: dataEntrega || null,
      })
      toast.success('Sugestão enviada para aprovação da liderança.')
      limpar()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar a sugestão.')
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={v => { if (!v) limpar(); onOpenChange(v) }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto',
            'bg-surface-canvas border-l border-line px-5 py-5 text-ink shadow-popover outline-none',
            'duration-200 data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right',
          )}
        >
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" className="absolute top-3 right-3" size="icon-sm">
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              <span className="sr-only">Fechar</span>
            </Button>
          </DialogPrimitive.Close>

          <div className="space-y-1 pr-8">
            <DialogPrimitive.Title className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <Lightbulb className="h-4 w-4 text-accentBlue" />
              Sugerir um projeto
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-[12px] text-ink-muted">
              A liderança avalia a proposta e pode pedir mais informações antes de decidir.
            </DialogPrimitive.Description>
          </div>

          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="proj-titulo">Título</Label>
              <Input
                id="proj-titulo"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Ex.: Alerta de professor sem lançamento no WhatsApp"
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={v => setTipo(v as ProjetoTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_PROJETO.map(t => (
                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tipoInfo && <p className="text-[11px] text-ink-muted">{tipoInfo.descricao}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="proj-descricao">O que é e que problema resolve</Label>
              <textarea
                id="proj-descricao"
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                rows={5}
                placeholder="Descreva a situação hoje, o que incomoda e o que você propõe."
                className="w-full resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="proj-impacto">Ganho esperado <span className="text-ink-subtle">(opcional)</span></Label>
              <textarea
                id="proj-impacto"
                value={impacto}
                onChange={e => setImpacto(e.target.value)}
                rows={3}
                placeholder="Ex.: some com a planilha manual e economiza ~2h por semana do time."
                className="w-full resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Prioridade sugerida</Label>
                <Select value={prioridade} onValueChange={v => setPrioridade(v as ProjetoPrioridade)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['alta', 'media', 'baixa'] as ProjetoPrioridade[]).map(p => (
                      <SelectItem key={p} value={p}>{PRIORIDADE_META[p].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-prazo">Prazo desejado</Label>
                <Input
                  id="proj-prazo"
                  type="date"
                  value={dataEntrega}
                  onChange={e => setDataEntrega(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="mt-auto flex items-center justify-end gap-2 pt-2">
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm">Cancelar</Button>
            </DialogPrimitive.Close>
            <Button size="sm" onClick={enviar} disabled={!valido || criar.isPending}>
              {criar.isPending ? 'Enviando…' : 'Enviar para aprovação'}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
