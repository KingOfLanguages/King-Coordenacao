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
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})