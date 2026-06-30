import { createRoot } from 'react-dom/client'
import { Panel } from './Panel'

function montar() {
  if (document.getElementById('king-nexus-root')) return

  const host = document.createElement('div')
  host.id = 'king-nexus-root'
  document.body.appendChild(host)

  // Shadow DOM isola os estilos do painel dos estilos (e do CSS reset) do Meet.
  const shadow = host.attachShadow({ mode: 'open' })
  const mountPoint = document.createElement('div')
  shadow.appendChild(mountPoint)

  createRoot(mountPoint).render(<Panel />)
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  montar()
} else {
  document.addEventListener('DOMContentLoaded', montar)
}
