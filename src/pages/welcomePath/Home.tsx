import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { FundoPortal } from '@/components/portal/PortalUI'
import { IdentificacaoPortal } from '@/components/portal/IdentificacaoPortal'
import { BoasVindasKingsCircle } from '@/components/portal/BoasVindasKingsCircle'
import { usePortalSessao } from '@/hooks/usePortalIdentidade'
import { baixarMapa, useTrilha } from '@/hooks/useWelcomePath'
import { sessaoRecusada } from '@/lib/invocarFuncao'
import { TrilhaView } from './TrilhaView'
import { EtapaView } from './EtapaView'

// ─────────────────────────────────────────────────────────────────────────────
// Portal público do Welcome Path (/welcome-path).
//
// A entrada é a mesma de /agendar: o professor recebe um código no e-mail
// oficial e a sessão vale para os portais do professor. Aqui a
// jornada dura dias, então a sessão fica guardada no dispositivo (validade
// deslizante de 14 dias) e as visitas seguintes caem direto na trilha.
//
// A etapa aberta mora no endereço (/welcome-path?etapa=<id>), cada uma numa
// entrada do histórico: o "voltar" do navegador fecha a etapa e cai na lista,
// em vez de sair da trilha para o site anterior (pedido do João, 15/10/2026).
// ─────────────────────────────────────────────────────────────────────────────

/** Marca, no histórico, a entrada da etapa que a própria trilha empilhou —
 *  aí o botão Voltar da tela pode simplesmente desempilhar. */
type EstadoHistorico = { daTrilha?: boolean } | null

export function Home() {
  const { token, entrar, sair: sairSessao, invalidar } = usePortalSessao()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const etapaAberta = token ? params.get('etapa') : null

  const trilha = useTrilha(token)

  // Token guardado que o servidor recusou (expirou, professor desligado):
  // limpa e cai na identificação, sem tela de erro para o professor.
  if (token && trilha.isError && sessaoRecusada(trilha.error)) invalidar()

  // Entrou direto numa etapa (link colado, favorito): põe a lista embaixo dela
  // no histórico, senão o primeiro "voltar" já sairia da trilha. Uma vez só
  // (o ref segura o efeito dobrado do StrictMode). Recarregar a página mantém
  // o `state` do histórico, então quem recarrega dentro da etapa não passa aqui.
  const ajustouEntrada = useRef(false)
  useEffect(() => {
    if (ajustouEntrada.current) return
    ajustouEntrada.current = true
    const id = params.get('etapa')
    if (!id || (location.state as EstadoHistorico)?.daTrilha) return
    navigate('/welcome-path', { replace: true })
    navigate(`/welcome-path?etapa=${encodeURIComponent(id)}`, { state: { daTrilha: true } })
  }, [params, location.state, navigate])

  // Saiu de uma etapa (botão da tela ou do navegador): recarrega a trilha — a
  // etapa pode ter concluído a trilha, ou o prazo pode ter acabado enquanto ele
  // estudava.
  const recarregar = trilha.refetch
  const etapaAntes = useRef(etapaAberta)
  useEffect(() => {
    if (etapaAntes.current && !etapaAberta) void recarregar()
    etapaAntes.current = etapaAberta
  }, [etapaAberta, recarregar])

  function abrirEtapa(id: string) {
    navigate(`/welcome-path?etapa=${encodeURIComponent(id)}`, { state: { daTrilha: true } })
  }

  /** Da etapa direto para a seguinte: troca a entrada do histórico em vez de
   *  empilhar, para o "voltar" continuar caindo na lista. */
  function irParaProxima(id: string) {
    navigate(`/welcome-path?etapa=${encodeURIComponent(id)}`, { replace: true, state: { daTrilha: true } })
    window.scrollTo({ top: 0 })
  }

  function voltarParaTrilha() {
    if ((location.state as EstadoHistorico)?.daTrilha) navigate(-1)
    else navigate('/welcome-path', { replace: true })
  }

  function sair() {
    if (etapaAberta) navigate('/welcome-path', { replace: true })
    void sairSessao()
  }

  // ── Já identificado ────────────────────────────────────────────────────────
  if (token) {
    const carregando = trilha.isLoading
    const jornada = trilha.data?.jornada ?? null
    // Hora do servidor − hora do navegador no instante em que a trilha chegou.
    const offsetMs = jornada ? new Date(jornada.agora).getTime() - trilha.dataUpdatedAt : 0
    const etapas = trilha.data?.etapas ?? []
    const idx = etapas.findIndex(e => e.id === etapaAberta)
    const seguinte = idx >= 0 ? etapas[idx + 1] : undefined
    return (
      <Moldura larga>
        <BoasVindasKingsCircle professor={trilha.data?.professor} />
        {carregando ? (
          <p className="py-16 text-center text-[13px] text-ink-muted">Carregando sua trilha…</p>
        ) : etapaAberta ? (
          // A chave remonta a etapa ao seguir para a próxima: sem ela, a nova
          // herdaria o quiz da anterior e não seria marcada como iniciada.
          <EtapaView
            key={etapaAberta}
            token={token}
            etapaId={etapaAberta}
            onVoltar={voltarParaTrilha}
            numero={idx + 1}
            totalEtapas={etapas.length}
            etapasConcluidas={etapas.filter(e => e.estado === 'concluida').length}
            prazo={jornada && !jornada.concluidaEm ? { prazoEm: jornada.prazoEm, offsetMs } : null}
            proxima={seguinte ? { ...seguinte, numero: idx + 2 } : null}
            onAbrirProxima={irParaProxima}
          />
        ) : trilha.isError ? (
          <p className="py-16 text-center text-[13px] text-ink-muted">
            Não foi possível carregar sua trilha agora. Recarregue a página em instantes.
          </p>
        ) : trilha.data ? (
          <TrilhaView
            nome={trilha.data.professor.nome}
            kingsCircle={!!trilha.data.professor.kingsCircle}
            etapas={trilha.data.etapas}
            onAbrir={abrirEtapa}
            onSair={sair}
            jornada={jornada}
            offsetMs={offsetMs}
            primeiraReuniao={trilha.data.primeiraReuniao}
            onExpirar={() => { void recarregar() }}
            dispensa={trilha.data.dispensa}
            onBaixarMapa={() => baixarMapa(token)}
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
