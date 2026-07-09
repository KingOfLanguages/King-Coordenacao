import { useState } from 'react'
import { Download, Copy, Check } from 'lucide-react'

const EXTENSAO_ZIP_URL = '/extension/king-teachertrack-extension.zip'

const NAVEGADORES = [
  { nome: 'Chrome', url: 'chrome://extensions' },
  { nome: 'Brave', url: 'brave://extensions' },
] as const

export function ExtensaoConteudo() {
  const [copiado, setCopiado] = useState<string | null>(null)

  async function copiarUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(url)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      // Clipboard indisponível (ex: contexto não seguro) — usuário copia manualmente.
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-ink-muted">
        Reconhece o professor automaticamente numa chamada do Google Meet e mostra perfil, histórico
        e observações sem precisar trocar de aba. Funciona no Google Chrome e no Brave.
      </p>

      {/* Download */}
      <section className="card-surface p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-0.5">
            <h2 className="text-[15px] font-semibold text-ink">Baixar extensão</h2>
            <p className="text-[13px] text-ink-muted">Arquivo .zip pronto para instalar no Chrome ou no Brave.</p>
          </div>
          <a
            href={EXTENSAO_ZIP_URL}
            download
            className="btn-press inline-flex items-center gap-2 rounded-full bg-accentBlue px-4 py-2 text-[13px] font-medium text-white hover:bg-accentBlue-hov flex-shrink-0"
          >
            <Download className="h-4 w-4" />
            Baixar extensão (.zip)
          </a>
        </div>
      </section>

      {/* Instalação */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink">Como instalar</h2>
        <div className="card-surface p-5">
          <ol className="space-y-4">
            <PassoItem numero={1} titulo="Baixe e extraia o .zip">
              Clique em "Baixar extensão" acima e extraia o arquivo numa pasta fixa do computador — não
              apague depois, o navegador lê os arquivos direto dali.
            </PassoItem>

            <PassoItem numero={2} titulo="Abra as extensões do navegador">
              <div className="space-y-1.5">
                <span>Cole o endereço na barra do seu navegador:</span>
                {NAVEGADORES.map(nav => (
                  <div key={nav.url} className="flex items-center gap-2 flex-wrap">
                    <span className="w-14 text-[12px] font-medium text-ink-secondary">{nav.nome}</span>
                    <code className="rounded-md bg-surface-subtle px-2 py-0.5 text-[12px] text-ink">{nav.url}</code>
                    <button
                      onClick={() => copiarUrl(nav.url)}
                      className="btn-press inline-flex items-center gap-1 text-[12px] text-accentBlue hover:underline"
                    >
                      {copiado === nav.url
                        ? <><Check className="h-3.5 w-3.5" />Copiado</>
                        : <><Copy className="h-3.5 w-3.5" />Copiar</>}
                    </button>
                  </div>
                ))}
              </div>
            </PassoItem>

            <PassoItem numero={3} titulo='Ative o "Modo desenvolvedor"'>
              É um botão no canto superior direito da página de extensões — igual no Chrome e no Brave.
            </PassoItem>

            <PassoItem numero={4} titulo='Clique em "Carregar sem compactação"'>
              Selecione a pasta que você extraiu no passo 1.
            </PassoItem>

            <PassoItem numero={5} titulo="Entre com sua conta">
              Clique no ícone da extensão na barra do navegador e entre com as mesmas credenciais do KingCodex.
              Depois disso, é só entrar numa chamada do Meet — o painel aparece sozinho.
            </PassoItem>
          </ol>
        </div>
      </section>
    </div>
  )
}

function PassoItem({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-subtle text-[12px] font-semibold text-ink-secondary">
        {numero}
      </span>
      <div className="space-y-1 pt-0.5">
        <p className="text-[13px] font-medium text-ink">{titulo}</p>
        <div className="text-[12.5px] text-ink-muted leading-relaxed">{children}</div>
      </div>
    </li>
  )
}
