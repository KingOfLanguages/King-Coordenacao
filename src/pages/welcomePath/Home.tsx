import { useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { FundoPortal } from '@/components/portal/PortalUI'
import { IdentificacaoPortal } from '@/components/portal/IdentificacaoPortal'
import { usePortalSessao } from '@/hooks/usePortalIdentidade'
import { useTrilha } from '@/hooks/useWelcomePath'
import { sessaoRecusada } from '@/lib/invocarFuncao'
import { TrilhaView } from './TrilhaView'
import { EtapaView } from './EtapaView'

// ─────────────────────────────────────────────────────────────────────────────
// Portal público do Welcome Path (/welcome-path).
//
// A entrada é a mesma de /pausa, /transferencia e /agendar: o professor recebe
// um código no e-mail oficial e a sessão vale para os quatro portais. Aqui a
// jornada dura dias, então a sessão fica guardada no dispositivo (validade
// deslizante de 14 dias) e as visitas seguintes caem direto na trilha.
// ─────────────────────────────────────────────────────────────────────────────

export function Home() {
  const { token, entrar, sair: sairSessao, invalidar } = usePortalSessao()
  const [etapaAberta, setEtapaAberta] = useState<string | null>(null)

  const trilha = useTrilha(token)

  // Token guardado que o servidor recusou (expirou, professor desligado):
  // limpa e cai na identificação, sem tela de erro para o professor.
  if (token && trilha.isError && sessaoRecusada(trilha.error)) invalidar()

  function sair() {
    setEtapaAberta(null)
    void sairSessao()
  }

  // ── Já identificado ────────────────────────────────────────────────────────
  if (token) {
    const carregando = trilha.isLoading
    return (
      <Moldura larga>
        {carregando ? (
          <p className="py-16 text-center text-[13px] text-ink-muted">Carregando sua trilha…</p>
        ) : etapaAberta ? (
          <EtapaView
            token={token}
            etapaId={etapaAberta}
            onVoltar={() => setEtapaAberta(null)}
            numero={(trilha.data?.etapas.findIndex(e => e.id === etapaAberta) ?? -1) + 1}
            totalEtapas={trilha.data?.etapas.length ?? 0}
            etapasConcluidas={trilha.data?.etapas.filter(e => e.estado === 'concluida').length ?? 0}
          />
        ) : trilha.isError ? (
          <p className="py-16 text-center text-[13px] text-ink-muted">
            Não foi possível carregar sua trilha agora. Recarregue a página em instantes.
          </p>
        ) : trilha.data ? (
          <TrilhaView
            nome={trilha.data.professor.nome}
            etapas={trilha.data.etapas}
            onAbrir={setEtapaAberta}
            onSair={sair}
          />
        ) : null}
      </Moldura>
    )
  }

  // ── Identificação ──────────────────────────────────────────────────────────
  return (
    <Moldura>
      <IdentificacaoPortal
        icone={GraduationCap}
        titulo="Welcome Path"
        descricao="Sua trilha de boas-vindas à King. Informe seu e-mail cadastrado para começar."
        onEntrar={entrar}
      />
    </Moldura>
  )
}

/** Moldura comum: fundo do portal e centralização. `larga` dá espaço à trilha,
 *  que é uma lista, não um cartão de formulário. */
function Moldura({ children, larga = false }: { children: React.ReactNode; larga?: boolean }) {
  return (
    <div className={`relative min-h-[100dvh] overflow-hidden bg-surface-app px-5 ${larga ? 'py-10' : 'flex items-center justify-center p-6'}`}>
      <FundoPortal />
      <div className="relative z-10 flex w-full justify-center">{children}</div>
    </div>
  )
}
