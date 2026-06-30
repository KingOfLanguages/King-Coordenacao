import { createClient } from '@supabase/supabase-js'

// Mesmo projeto Supabase do app principal (king-saas) — chave anon é pública,
// a segurança real é via RLS (mesmo modelo do app web).
const SUPABASE_URL      = 'https://dajbzpeduxmsxyukmjfm.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhamJ6cGVkdXhtc3h5dWttamZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MTI2NTEsImV4cCI6MjA5MjI4ODY1MX0.Biod-ZZASyZxWtUX3hvjsTqs1O1aGRy-yAKJ6EK9WCw'

// Storage da sessão usando chrome.storage.local (só funciona no contexto do
// background/service worker — onde este client deve ser instanciado).
const chromeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const result = await chrome.storage.local.get(key)
    return (result[key] as string | undefined) ?? null
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [key]: value })
  },
  removeItem: async (key: string): Promise<void> => {
    await chrome.storage.local.remove(key)
  },
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
