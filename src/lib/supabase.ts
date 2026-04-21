import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error(
    'Variáveis de ambiente ausentes: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar configuradas no Vercel.'
  )
}

export const supabase = createClient(url, key)