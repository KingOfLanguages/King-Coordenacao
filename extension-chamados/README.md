# King — Incidente → Chamado T.I.

Extensão de navegador que leva um incidente da **Gestão dos Professores**
(`projeto-king-coord.vercel.app`) para a **plataforma de chamados do T.I.**
(`chamadostikingoflanguages.lovable.app`) já formatado — sem copiar e colar
campo por campo.

## Como usar

1. Abra **Incidentes** na Gestão dos Professores.
2. Cada incidente (no card da lista e no painel de detalhe) ganha o botão
   **Chamado T.I.**
3. Clicar abre o formulário `/novo-chamado` já preenchido: título, descrição,
   urgência, tipo e os anexos do incidente.
4. Confira e clique em **Criar chamado**. (O envio automático existe, mas vem
   desligado — veja o popup da extensão.)

O usuário precisa estar logado nas duas plataformas; a extensão não guarda nem
transporta credencial nenhuma, ela dirige o navegador já autenticado.

## Instalação (sem build — é JS puro)

1. `chrome://extensions` → ligue o **Modo do desenvolvedor**.
2. **Carregar sem compactação** → aponte para esta pasta (`extension-chamados`).
3. Recarregue a aba da Gestão dos Professores que já estivesse aberta.

## O que vira o quê

A tradução mora no KTM (`src/lib/chamadoTi.ts`), não aqui — categoria nova no
KTM **não** exige atualizar a extensão.

| Incidente (KTM) | Chamado (T.I.) |
| --- | --- |
| `Bugs` | tipo **Bug** |
| `Melhorias` | tipo **Melhoria** |
| qualquer outra categoria | tipo **Solicitação Diversa** |
| urgência `Baixa` / `Média` / `Alta` | mesma urgência |
| urgência `Crítico` | urgência **Crítica** (é como se chama lá) |
| rótulo livre / professor + categoria | **Título** (corta em 120 caracteres) |
| descrição + contexto + link de volta | **Descrição** (corta em 5.000) |
| imagens do incidente | **Anexos** (até 5, 5 MB cada) |

A descrição sempre termina com o deep-link `…/incidentes?incidente=<id>`, então
o T.I. consegue voltar ao incidente original.

## Como as peças conversam

```
KTM (React)                  extensão                    Plataforma do T.I.
───────────                  ────────                    ──────────────────
data-ktm-chamado   ──lê──►  ktm.js
(payload pronto)             │ clique no botão
data-ktm-chamado-slot        ▼
(onde o botão nasce)        background.js
                             │ guarda "pendente" amarrado à aba
                             │ abre /novo-chamado
                             ▼
                            chamados.js  ──preenche──►  formulário
```

`background.js` só entrega o payload para **a aba que ele mesmo abriu**, e
apaga na entrega — duas abas abertas não preenchem o mesmo chamado duas vezes.
Um pendente não consumido em 15 minutos é descartado.

## Detalhes que não são óbvios

- **Título e descrição** não podem ser preenchidos com `el.value = …`: o
  formulário é react-hook-form e o React ignora a mudança. Usamos o setter do
  protótipo + evento `input` (`preencherTexto`).
- **Urgência** não é um `<select>` clicável, é um Radix Select — precisa abrir
  com `pointerdown` e selecionar a opção com `pointerup` (as opções vivem num
  portal, fora do formulário). O Radix mantém ao lado um
  `<select aria-hidden>` com o valor real: ele serve para **conferir** se a
  escolha pegou (imune a ícone e tema), mas **não** para escolher — escrever
  nele não avisa o Radix.
- **Tipo** é um Radix RadioGroup com ids fixos (`tipo-bug`, `tipo-melhoria`,
  `tipo-duvida`, `tipo-solicitacao-diversa`).
- **Anexos** são baixados pelo service worker (que tem `host_permissions` do
  bucket do KTM e por isso não esbarra em CORS) e injetados no
  `<input type="file">` via `DataTransfer`.
- Se algum campo não puder ser preenchido, a faixa no topo do formulário diz
  qual — nada é enviado pela metade em silêncio.

## Se o botão não aparecer

- A página precisa estar servida por uma origem listada no `manifest.json`
  (produção ou `localhost`). Rodando o KTM em outro domínio, acrescente-o em
  `content_scripts.matches` **e** em `host_permissions`.
- O botão vive num `<span data-ktm-chamado-slot>` que o KTM renderiza. Se o
  front estiver num build anterior a esta feature, o slot não existe.
