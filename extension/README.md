# King TeacherTrack — Assistente de Reunião (extensão Chrome/Brave)

Reconhece o professor automaticamente numa chamada do Google Meet e mostra um
painel flutuante com o dossiê dele — sem precisar abrir o King TeacherTrack em
outra aba.

O visual é escuro, de vidro, para ler como parte da chamada — e a informação é
dividida em **abas** (Visão · Grupo · Situação · Números · Alunos · Registros),
cada uma com um selo do que exige atenção. A aba **Grupo** só existe em reunião
com vários professores, e o painel abre direto nela. A identificação do professor fica fixa no topo,
fora da rolagem, em qualquer aba.

O painel traz:

- **Identificação** (fixa) — nome, e-mail e telefone copiáveis em um clique
  (+ atalho de WhatsApp). Na aba Visão: grupo, coordenação, tempo de casa,
  cidade, nível recomendado, retorno de pausa e o aviso de cadastro não confirmado.
- **Leitura rápida** — veredito de confiabilidade dos últimos 90 dias e Índice de
  Prioridade, com os sinais que formam cada um. As duas contas são importadas do
  app (`src/lib/confiabilidade.ts` e `src/lib/prioridade.ts`), não recalculadas.
- **Pendência de lançamento** do King, com desbloqueio de agenda.
- **Reunião do dia** (1:1 ou em grupo), observação da reunião e **anotação
  privada** — a mesma de Minha Área, que só o autor lê.
- **Grupo** (só em reunião com vários professores) — identifica todo mundo da
  chamada e ordena **do melhor ao pior** pela régua interna: score do King, menos
  incidentes, mais feedbacks positivos (e menos negativos como contrapeso). Cada
  linha abre o "por que esta posição?" com os pontos de cada eixo, e um toque no
  nome carrega o dossiê daquele professor. A conta mora em
  `src/lib/rankingProfessores.ts`, compartilhada com o app.
- **Situação** — o que está em aberto fora do King: pausa, transferências de
  aluno, convocações, tarefas, episódio de silêncio, onboarding dos primeiros
  dias, trilha de boas-vindas, mensagem do dia e último e-mail disparado.
- **Score** com gráfico de evolução mensal e **avaliação dos alunos** com
  distribuição de estrelas + gráfico de evolução no tempo.
- **Feedbacks · dois meses** — colunas por DIA do mês corrente e do anterior
  (positivo sobe, negativo desce), placar dos dois meses e a lista dos negativos
  com data, origem e texto. Duas fontes com precisão diferente, sempre rotuladas:
  observação do KTM tem data exata; comentário de aluno é datado pelo dia em que
  o contador do King subiu (o King não expõe a data do comentário).
- **Alunos** — a carteira com nome, mais quem saiu dela.
- Histórico de reuniões, observações, ocorrências (com natureza, aluno, prazo e
  chamado de TI), Mês de Análise e uma área própria para **registrar incidente**
  (chamado ou informe, com aluno e prazo).

Funciona em qualquer navegador baseado em Chromium. Testado no Google Chrome
e no Brave — a extensão usa só `chrome.storage` e `chrome.runtime`, que o
Brave suporta integralmente, então o mesmo build serve para os dois.

## Como testar (modo desenvolvedor)

```bash
cd extension
npm install
npm run build
```

1. Abra a página de extensões do navegador:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta `extension/dist`.
4. Clique no ícone da extensão na barra do navegador e faça login com as mesmas
   credenciais do King TeacherTrack.
5. Entre numa chamada do Google Meet — o painel aparece no canto inferior
   direito automaticamente quando reconhece um professor pelo nome dos
   participantes. Se não reconhecer, tem busca manual por nome no próprio painel.

Depois de qualquer mudança no código, rode `npm run build` de novo e clique
no ícone de recarregar da extensão na página de extensões.

## Sistema visual

`src/content/estilos.ts` é a folha de estilo do painel, injetada no shadow root
por `content/index.tsx` — e reaproveitada pelo popup. Ela existe porque estilo
inline não faz `:hover`, `:focus`, keyframes nem variáveis; o shadow root garante
que nada disso vaza para o Meet (nem o Meet vaza para cá).

Duas restrições que valem manter ao mexer:

- **`backdrop-filter` só na casca**, que é `position: fixed`. O corpo que rola é
  opaco de propósito: blur em container com rolagem repinta a cada quadro e
  derruba o FPS da chamada.
- **Animar só `transform` e `opacity`.** Nada de animar altura/posição.

## Como funciona

- **Reconhecimento**: lê os nomes dos participantes visíveis no Meet e
  compara com os professores cadastrados (mesma lógica de match por nome do
  `daily-import`). O DOM do Meet não é documentado e muda com frequência —
  por isso é "melhor esforço", sempre com busca manual como caminho garantido.
- **Login**: tela própria (não reaproveita a sessão da aba do site), sessão
  guardada em `chrome.storage.local`.
- **Dados**: mesmo projeto Supabase do app principal, mesmas regras de RLS —
  um coordenador só vê o que já veria logado no King TeacherTrack.
- **Brave**: as chamadas ao Supabase saem do service worker da extensão, fora
  do alcance do Shields — não precisa desativar nada.

## Pendente (próximas fases)

- O gráfico de avaliação depende da migration `20260771_professor_avaliacao_historico`
  (tabela + gatilho + backfill). Sem ela aplicada, o painel mostra só a foto de
  hoje e a mensagem de que a série ainda vai acumular.
- Ícones da extensão (atualmente sem ícone customizado).
- Publicação na Chrome Web Store (hoje só roda "sem compactação"/modo dev).
