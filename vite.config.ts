import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Sem isto o scanner do Vite entra em `extension/`, que tem node_modules
  // próprio com React 18, e pré-bundla o `react-dom/client` DE LÁ contra o
  // React 19 da raiz — a app abre em branco com "Objects are not valid as a
  // React child". O build de produção não passa pelo scanner e nunca quebrou.
  optimizeDeps: {
    entries: ['index.html', 'src/**/*.{ts,tsx}'],
  },
  // Identificador do build, para quebrar cache de arquivo de public/ que o app
  // referencia por URL fixa (hoje: as páginas do bloco `embed`). Sem isso, um
  // header que muda sem o arquivo mudar nunca chega ao navegador: o ETag é o
  // mesmo, a Vercel responde 304 e ele segue com os headers antigos guardados.
  // Na Vercel é o commit; local, o horário do start.
  define: {
    __BUILD_ID__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? String(Date.now()),
    ),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})