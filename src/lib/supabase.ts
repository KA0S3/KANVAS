import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL environment variable is missing')
}

if (!supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_ANON_KEY environment variable is missing')
}

// Singleton pattern to prevent multiple instances
let supabaseInstance: ReturnType<typeof createClient> | null = null

export const supabase = (() => {
  if (supabaseInstance) {
    console.warn('⚠️ [Supabase] Returning existing instance to prevent multiple clients')
    return supabaseInstance
  }
  
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey)
  console.log('✅ [Supabase] Created new singleton instance')
  return supabaseInstance
})()
