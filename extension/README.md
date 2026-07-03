# King TeacherTrack — Assistente de Reunião (extensão Chrome/Brave)

Reconhece o professor automaticamente numa chamada do Google Meet e mostra um
painel flutuante com perfil, grupo e últimas observações — sem precisar abrir
o King TeacherTrack em outra aba. **Versão atual: somente leitura.**

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

- Ações no painel (registrar observação, confirmar reunião) sem sair do Meet.
- Ícones da extensão (atualmente sem ícone customizado).
- Publicação na Chrome Web Store (hoje só roda "sem compactação"/modo dev).
