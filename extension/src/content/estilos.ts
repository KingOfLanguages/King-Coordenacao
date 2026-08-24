// ─────────────────────────────────────────────────────────────────────────────
// Sistema visual do painel — "vidro escuro" sobre a chamada do Meet.
//
// Por que CSS de verdade e não mais objetos de estilo inline: o painel é montado
// dentro de um shadow root (ver content/index.tsx), então uma folha de estilo
// aqui fica 100% isolada do Meet e libera o que inline não faz — :hover, :focus,
// keyframes, transições com curva própria e variáveis.
//
// Decisões que valem explicação:
//  • ESCURO. O painel flutua sobre a UI do Meet, que é escura; a versão branca
//    anterior queimava a vista e competia com o vídeo. Aqui ele lê como parte da
//    chamada, não como um pop-up de outro app.
//  • O blur fica SÓ na casca (position: fixed). O corpo que rola é opaco — blur
//    em container com scroll repinta a cada frame e derruba o FPS da chamada.
//  • Bezel duplo: casca externa (borda de luz + fundo translúcido) com um núcleo
//    interno de raio menor. Os raios são concêntricos (núcleo = casca − padding).
// ─────────────────────────────────────────────────────────────────────────────

/** Curva de todas as transições: sai rápido, chega devagar (peso físico). */
const MOLA = 'cubic-bezier(0.32, 0.72, 0, 1)'

export const CSS = `
:host, * { box-sizing: border-box; }

.ktm {
  /* ── Superfícies ─────────────────────────────────────────────────────── */
  --casca:        rgba(20, 20, 24, 0.78);
  --corpo:        #0B0B0E;
  --nucleo:       #131318;
  --nucleo-alto:  #191920;
  --fio:          rgba(255, 255, 255, 0.07);
  --fio-forte:    rgba(255, 255, 255, 0.12);
  --brilho:       inset 0 1px 0 rgba(255, 255, 255, 0.06);

  /* ── Tinta ───────────────────────────────────────────────────────────── */
  --ink:          #F2F2F5;
  --ink-2:        rgba(242, 242, 245, 0.64);
  --ink-3:        rgba(242, 242, 245, 0.40);

  /* ── Semântica (calibrada para fundo escuro) ─────────────────────────── */
  --marca:        #E14B52;
  --verde:        #46D68F;   --verde-bg:    rgba(70, 214, 143, 0.13);
  --ambar:        #F5B544;   --ambar-bg:    rgba(245, 181, 68, 0.13);
  --vermelho:     #FF7070;   --vermelho-bg: rgba(255, 112, 112, 0.13);
  --azul:         #86A8FF;   --azul-bg:     rgba(134, 168, 255, 0.13);

  --raio-casca:   26px;
  --raio-nucleo:  20px;

  position: fixed;
  top: 64px;
  left: 16px;
  width: 392px;
  max-height: calc(100vh - 96px);
  z-index: 2147483647;

  display: flex;
  flex-direction: column;
  overflow: hidden;

  padding: 6px;
  border-radius: var(--raio-casca);
  border: 1px solid var(--fio);
  background: var(--casca);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  box-shadow:
    0 32px 80px -24px rgba(0, 0, 0, 0.72),
    0 2px 8px rgba(0, 0, 0, 0.28),
    var(--brilho);

  color: var(--ink);
  font-family: ui-sans-serif, -apple-system, "SF Pro Text", "Segoe UI Variable Text",
               "Segoe UI", system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  font-variant-numeric: tabular-nums;
}

/* Duas auroras discretas atrás do topo — dão profundidade sem virar "gradiente". */
.ktm::before {
  content: '';
  position: absolute;
  inset: -40% -30% auto -30%;
  height: 320px;
  pointer-events: none;
  background:
    radial-gradient(46% 46% at 22% 34%, rgba(225, 75, 82, 0.20), transparent 70%),
    radial-gradient(40% 40% at 80% 20%, rgba(122, 140, 255, 0.16), transparent 70%);
  filter: blur(24px);
  opacity: 0.9;
}

/* ── Núcleo: o miolo escuro dentro da casca ───────────────────────────── */
.ktm-nucleo {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-radius: var(--raio-nucleo);
  background: var(--corpo);
  border: 1px solid var(--fio);
  overflow: hidden;
}

/* ── Cabeçalho ────────────────────────────────────────────────────────── */
.ktm-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 13px 11px;
  border-bottom: 1px solid var(--fio);
  background: linear-gradient(180deg, rgba(255,255,255,0.045), transparent);
}

.ktm-marca {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.ktm-selo {
  width: 22px; height: 22px;
  flex-shrink: 0;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: #fff;
  background: linear-gradient(150deg, var(--marca), #A62830);
  box-shadow: 0 3px 10px -3px rgba(225, 75, 82, 0.7), var(--brilho);
}

.ktm-marca-txt {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-2);
  white-space: nowrap;
}

.ktm-icone-btn {
  width: 26px; height: 26px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  font-family: inherit;
  transition: color 400ms ${MOLA}, background 400ms ${MOLA}, border-color 400ms ${MOLA};
}
.ktm-icone-btn:hover {
  color: var(--ink);
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--fio);
}

/* ── Identidade (nome + contatos copiáveis) ───────────────────────────── */
.ktm-id {
  padding: 13px 13px 12px;
  border-bottom: 1px solid var(--fio);
}

.ktm-id-nome {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.ktm-nome {
  font-size: 16.5px;
  font-weight: 620;
  letter-spacing: -0.022em;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.ktm-contatos {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

/* Pílula de contato: o texto é o botão de copiar. */
.ktm-copia {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 5px 4px 9px;
  border: 1px solid var(--fio);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--ink-2);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: transform 500ms ${MOLA}, background 500ms ${MOLA},
              border-color 500ms ${MOLA}, color 500ms ${MOLA};
}
.ktm-copia:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--fio-forte);
  color: var(--ink);
}
.ktm-copia:active { transform: scale(0.97); }
.ktm-copia--ok    { color: var(--verde); border-color: rgba(70, 214, 143, 0.4); background: var(--verde-bg); }
.ktm-copia--erro  { color: var(--vermelho); border-color: rgba(255, 112, 112, 0.4); }

.ktm-copia-txt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Ícone dentro do seu próprio círculo, encostado na borda interna da pílula. */
.ktm-copia-icone {
  width: 20px; height: 20px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  transition: transform 500ms ${MOLA}, background 500ms ${MOLA};
}
.ktm-copia:hover .ktm-copia-icone {
  background: rgba(255, 255, 255, 0.13);
  transform: translateY(-1px) scale(1.06);
}
.ktm-copia-icone svg { width: 11px; height: 11px; display: block; }

.ktm-wpp {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(70, 214, 143, 0.28);
  background: var(--verde-bg);
  color: var(--verde);
  font-size: 11px;
  font-weight: 550;
  text-decoration: none;
  white-space: nowrap;
  transition: transform 500ms ${MOLA}, background 500ms ${MOLA};
}
.ktm-wpp:hover { background: rgba(70, 214, 143, 0.2); transform: translateY(-1px); }

/* Copiar o nome: fica no próprio título, sem repetir o nome numa pílula. */
.ktm-nome-copia {
  width: 24px; height: 24px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--fio);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--ink-3);
  cursor: pointer;
  transition: all 450ms ${MOLA};
}
.ktm-nome-copia:hover  { color: var(--ink); background: rgba(255,255,255,0.1); border-color: var(--fio-forte); }
.ktm-nome-copia:active { transform: scale(0.94); }
.ktm-nome-copia--ok    { color: var(--verde); border-color: rgba(70,214,143,0.4); background: var(--verde-bg); }
.ktm-nome-copia svg    { width: 12px; height: 12px; display: block; }

/* ── Abas ─────────────────────────────────────────────────────────────── */
.ktm-abas {
  position: relative;
  display: flex;
  gap: 1px;
  padding: 7px 6px 0;
  border-bottom: 1px solid var(--fio);
  overflow-x: auto;
  scrollbar-width: none;
}
/* Esmaece a última aba em vez de cortá-la em seco — só quando a fileira REALMENTE
   rola, senão a última aba viveria apagada à toa (a classe vem medida do React). */
.ktm-abas--rola {
  -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 22px), transparent);
          mask-image: linear-gradient(90deg, #000 calc(100% - 22px), transparent);
}
.ktm-abas::-webkit-scrollbar { display: none; }

.ktm-aba {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 7px 8px 9px;
  border: 0;
  background: transparent;
  color: var(--ink-3);
  font: inherit;
  font-size: 11px;
  font-weight: 550;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: color 450ms ${MOLA};
}
.ktm-aba:hover { color: var(--ink-2); }
.ktm-aba--on   { color: var(--ink); }

/* Sublinhado que corre entre as abas em vez de piscar. */
.ktm-aba::after {
  content: '';
  position: absolute;
  left: 6px; right: 6px; bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background: var(--marca);
  transform: scaleX(0);
  transform-origin: center;
  transition: transform 550ms ${MOLA};
}
.ktm-aba--on::after { transform: scaleX(1); }

.ktm-aba-n {
  min-width: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.09);
  font-size: 9.5px;
  font-weight: 650;
  line-height: 16px;
  text-align: center;
  color: var(--ink-2);
}
.ktm-aba-n--alerta { background: var(--vermelho-bg); color: var(--vermelho); }

/* ── Corpo rolável ────────────────────────────────────────────────────── */
.ktm-corpo {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  overflow-anchor: none;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ktm-corpo::-webkit-scrollbar { width: 8px; }
.ktm-corpo::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  background-clip: padding-box;
  border-radius: 99px;
  background-color: rgba(255, 255, 255, 0.12);
}
.ktm-corpo::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.22); }

/* ── Cartão ───────────────────────────────────────────────────────────── */
.ktm-cartao {
  position: relative;
  padding: 12px 13px;
  border-radius: 16px;
  background: var(--nucleo);
  border: 1px solid var(--fio);
  box-shadow: var(--brilho);
}
.ktm-cartao--destaque { background: var(--nucleo-alto); }

.ktm-cartao-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 9px;
}

.ktm-rotulo {
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-3);
}

/* Bento: cartões de tamanhos diferentes na mesma grade. */
.ktm-bento {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.ktm-bento > .ktm-largo { grid-column: span 2; }

.ktm-fato {
  padding: 10px 11px;
  border-radius: 14px;
  background: var(--nucleo);
  border: 1px solid var(--fio);
  box-shadow: var(--brilho);
  min-width: 0;
}
.ktm-fato-k {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.ktm-fato-v {
  margin-top: 3px;
  font-size: 13px;
  font-weight: 550;
  color: var(--ink);
  letter-spacing: -0.012em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Selos ────────────────────────────────────────────────────────────── */
.ktm-selo-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--fio);
  background: rgba(255, 255, 255, 0.05);
  color: var(--ink-2);
  font-size: 10.5px;
  font-weight: 550;
  white-space: nowrap;
}
.ktm-selo-chip--verde    { color: var(--verde);    background: var(--verde-bg);    border-color: rgba(70, 214, 143, 0.22); }
.ktm-selo-chip--ambar    { color: var(--ambar);    background: var(--ambar-bg);    border-color: rgba(245, 181, 68, 0.22); }
.ktm-selo-chip--vermelho { color: var(--vermelho); background: var(--vermelho-bg); border-color: rgba(255, 112, 112, 0.22); }
.ktm-selo-chip--azul     { color: var(--azul);     background: var(--azul-bg);     border-color: rgba(134, 168, 255, 0.22); }

.ktm-chips { display: flex; flex-wrap: wrap; gap: 5px; }

/* ── Botões ───────────────────────────────────────────────────────────── */
.ktm-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 14px;
  border-radius: 999px;
  border: 1px solid var(--fio-forte);
  background: rgba(255, 255, 255, 0.06);
  color: var(--ink);
  font: inherit;
  font-size: 12.5px;
  font-weight: 550;
  cursor: pointer;
  transition: transform 450ms ${MOLA}, background 450ms ${MOLA}, border-color 450ms ${MOLA};
}
.ktm-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.11); border-color: rgba(255,255,255,0.2); }
.ktm-btn:active:not(:disabled) { transform: scale(0.975); }
.ktm-btn:disabled { opacity: 0.4; cursor: default; }
.ktm-btn--bloco { width: 100%; }

.ktm-btn--principal {
  background: var(--ink);
  border-color: transparent;
  color: #0B0B0E;
  padding-right: 5px;
}
.ktm-btn--principal:hover:not(:disabled) { background: #fff; }

.ktm-btn--ok {
  background: var(--verde-bg);
  border-color: rgba(70, 214, 143, 0.3);
  color: var(--verde);
}
.ktm-btn--ok:hover:not(:disabled) { background: rgba(70, 214, 143, 0.2); }

.ktm-btn--perigo {
  background: var(--vermelho-bg);
  border-color: rgba(255, 112, 112, 0.32);
  color: var(--vermelho);
}
.ktm-btn--perigo:hover:not(:disabled) { background: rgba(255, 112, 112, 0.2); }

/* Ícone no seu próprio círculo, encostado na borda interna do botão. */
.ktm-btn-icone {
  width: 26px; height: 26px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
  transition: transform 450ms ${MOLA}, background 450ms ${MOLA};
}
.ktm-btn--principal:hover .ktm-btn-icone {
  background: rgba(0, 0, 0, 0.14);
  transform: translate(2px, -1px) scale(1.05);
}
.ktm-btn-icone svg { width: 12px; height: 12px; display: block; }

.ktm-linkbtn {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink-2);
  font: inherit;
  font-size: 11.5px;
  font-weight: 550;
  cursor: pointer;
  transition: color 400ms ${MOLA};
}
.ktm-linkbtn:hover:not(:disabled) { color: var(--ink); }
.ktm-linkbtn:disabled { opacity: 0.45; cursor: default; }

.ktm-acoes { display: flex; gap: 7px; margin-top: 9px; }
.ktm-acoes > * { flex: 1; }

/* ── Campos ───────────────────────────────────────────────────────────── */
.ktm-campo,
.ktm-area,
.ktm-select {
  width: 100%;
  padding: 9px 11px;
  border-radius: 12px;
  border: 1px solid var(--fio);
  background: rgba(255, 255, 255, 0.04);
  color: var(--ink);
  font: inherit;
  font-size: 12.5px;
  outline: none;
  transition: border-color 400ms ${MOLA}, background 400ms ${MOLA}, box-shadow 400ms ${MOLA};
}
.ktm-campo::placeholder, .ktm-area::placeholder { color: var(--ink-3); }
.ktm-campo:focus, .ktm-area:focus, .ktm-select:focus {
  border-color: rgba(225, 75, 82, 0.45);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 3px rgba(225, 75, 82, 0.12);
}
.ktm-area { min-height: 62px; resize: vertical; }
.ktm-select { appearance: none; cursor: pointer; }
.ktm-select option { background: #17171C; color: var(--ink); }

/* Escolha em pílulas (natureza, urgência, tipo). */
.ktm-opcoes { display: flex; flex-wrap: wrap; gap: 5px; }
.ktm-opcao {
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid var(--fio);
  background: transparent;
  color: var(--ink-3);
  font: inherit;
  font-size: 11.5px;
  font-weight: 550;
  cursor: pointer;
  transition: all 450ms ${MOLA};
}
.ktm-opcao:hover { color: var(--ink-2); border-color: var(--fio-forte); }
.ktm-opcao--on {
  color: #0B0B0E;
  background: var(--ink);
  border-color: transparent;
}

/* ── Listas ───────────────────────────────────────────────────────────── */
.ktm-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.ktm-lista--esp { gap: 9px; }

.ktm-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--fio);
  min-width: 0;
}
.ktm-lista > .ktm-item:first-child { border-top: 0; padding-top: 2px; }

.ktm-item-nome {
  font-size: 12.5px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.ktm-item-meta { font-size: 10.5px; color: var(--ink-3); white-space: nowrap; flex-shrink: 0; }

/* Registro com filete colorido à esquerda (incidente / observação). */
.ktm-registro {
  padding: 9px 0 9px 11px;
  border-left: 2px solid var(--fio-forte);
  border-radius: 2px;
}
.ktm-registro--alta   { border-left-color: var(--ambar); }
.ktm-registro--critica{ border-left-color: var(--vermelho); }
.ktm-registro-topo {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.ktm-registro-txt { margin: 4px 0 0; font-size: 12.5px; color: var(--ink); line-height: 1.5; }

.ktm-txt   { font-size: 12.5px; color: var(--ink); line-height: 1.5; margin: 0; }
.ktm-txt-2 { font-size: 11.5px; color: var(--ink-2); line-height: 1.5; margin: 0; }
.ktm-txt-3 { font-size: 10.5px; color: var(--ink-3); line-height: 1.5; margin: 0; }
.ktm-erro  { font-size: 11.5px; color: var(--vermelho); margin: 8px 0 0; }

.ktm-vazio {
  padding: 26px 14px;
  text-align: center;
  font-size: 12px;
  color: var(--ink-3);
  line-height: 1.6;
}

/* ── Números grandes ──────────────────────────────────────────────────── */
.ktm-numero {
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.045em;
  line-height: 1;
  color: var(--ink);
}
.ktm-delta { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }

/* ── Barras (distribuição de estrelas / positivos-negativos) ──────────── */
.ktm-barra {
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  overflow: hidden;
  flex: 1;
}
.ktm-barra > i {
  display: block;
  height: 100%;
  border-radius: 999px;
  transform-origin: left;
  animation: ktm-barra 900ms ${MOLA} both;
}
@keyframes ktm-barra { from { transform: scaleX(0); } to { transform: scaleX(1); } }

.ktm-split { display: flex; height: 6px; border-radius: 999px; overflow: hidden; background: rgba(255,255,255,0.07); }
.ktm-split > i { display: block; height: 100%; }

/* ── Ranking da reunião em grupo ──────────────────────────────────────── */
.ktm-rank {
  display: block;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--fio);
  border-radius: 13px;
  background: var(--nucleo);
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 450ms ${MOLA}, background 450ms ${MOLA}, border-color 450ms ${MOLA};
}
.ktm-rank:hover { background: var(--nucleo-alto); border-color: var(--fio-forte); transform: translateX(2px); }

/* Os três primeiros ganham um filete à esquerda — pódio sem virar medalha. */
.ktm-rank--1 { border-left: 2px solid var(--verde); }
.ktm-rank--2 { border-left: 2px solid rgba(70, 214, 143, 0.5); }
.ktm-rank--3 { border-left: 2px solid rgba(70, 214, 143, 0.28); }
.ktm-rank--ultimo { border-left: 2px solid var(--vermelho); }

.ktm-rank-topo { display: flex; align-items: center; gap: 8px; min-width: 0; }

.ktm-rank-pos {
  width: 20px; height: 20px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  font-size: 10px;
  font-weight: 650;
  color: var(--ink-2);
}
.ktm-rank--1 .ktm-rank-pos { background: var(--verde); color: #08130D; }

.ktm-rank-nome {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 550;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ktm-rank-pts {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.ktm-rank-barra {
  height: 3px;
  margin: 7px 0 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  overflow: hidden;
}
.ktm-rank-barra > i {
  display: block;
  height: 100%;
  border-radius: 999px;
  transform-origin: left;
  animation: ktm-barra 900ms ${MOLA} both;
}

.ktm-rank-metricas {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 10.5px;
  color: var(--ink-3);
}
.ktm-rank-metricas b { color: var(--ink-2); font-weight: 600; }

/* Detalhe dos eixos (o "por quê" da posição). */
.ktm-eixo {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  padding: 3px 0;
}
.ktm-eixo-n { font-variant-numeric: tabular-nums; font-weight: 600; flex-shrink: 0; }

/* ── Caixa de presença (reunião em grupo) ─────────────────────────────── */
.ktm-check {
  width: 22px; height: 22px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 7px;
  border: 1px solid var(--fio-forte);
  background: transparent;
  color: transparent;
  cursor: pointer;
  transition: all 450ms ${MOLA};
}
.ktm-check:hover { border-color: rgba(70, 214, 143, 0.5); }
.ktm-check svg { width: 13px; height: 13px; display: block; }
.ktm-check--on {
  background: var(--verde);
  border-color: var(--verde);
  color: #08130D;
}

/* ── Sugestões de busca ───────────────────────────────────────────────── */
.ktm-sugestao {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--fio);
  background: var(--nucleo);
  color: var(--ink);
  font: inherit;
  font-size: 12.5px;
  font-weight: 550;
  text-align: left;
  cursor: pointer;
  transition: transform 450ms ${MOLA}, background 450ms ${MOLA}, border-color 450ms ${MOLA};
}
.ktm-sugestao:hover { background: var(--nucleo-alto); border-color: var(--fio-forte); transform: translateX(2px); }

/* ── Entrada em cena (nada aparece parado) ────────────────────────────── */
.ktm-entra {
  animation: ktm-sobe 700ms ${MOLA} both;
  animation-delay: var(--atraso, 0ms);
}
@keyframes ktm-sobe {
  from { opacity: 0; transform: translate3d(0, 14px, 0); filter: blur(5px); }
  to   { opacity: 1; transform: translate3d(0, 0, 0);    filter: blur(0); }
}

/* ── Botão flutuante (painel minimizado) ──────────────────────────────── */
.ktm-fab {
  position: fixed;
  top: 64px;
  left: 16px;
  z-index: 2147483647;
  width: 46px; height: 46px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 16px;
  border: 1px solid var(--fio, rgba(255,255,255,0.07));
  background: rgba(20, 20, 24, 0.78);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow: 0 18px 40px -16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.07);
  cursor: pointer;
  transition: transform 550ms ${MOLA}, box-shadow 550ms ${MOLA};
}
.ktm-fab::before { content: none; }  /* a aurora é do painel, não do botão */
.ktm-fab:hover  { transform: translateY(-2px) scale(1.04); box-shadow: 0 24px 50px -16px rgba(0,0,0,0.8); }
.ktm-fab:active { transform: scale(0.96); }

@media (prefers-reduced-motion: reduce) {
  .ktm *, .ktm::before { animation-duration: 1ms !important; transition-duration: 1ms !important; }
  .ktm-entra { animation: none; }
}
`

/** Injeta a folha de estilo no shadow root do painel (uma vez só). */
export function injetarEstilos(raiz: ShadowRoot) {
  if (raiz.querySelector('style[data-ktm]')) return
  const el = document.createElement('style')
  el.setAttribute('data-ktm', '')
  el.textContent = CSS
  raiz.appendChild(el)
}
