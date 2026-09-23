const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const forceDummy = import.meta.env.VITE_DUMMY === '1'

export const isSupabaseConfigured = Boolean(url && anonKey) && !forceDummy
export const isDummy = !isSupabaseConfigured

let cachedClient: import('@supabase/supabase-js').SupabaseClient | null = null

export async function getSupabase(): Promise<import('@supabase/supabase-js').SupabaseClient> {
  if (!isSupabaseConfigured || !url || !anonKey) {
    throw new Error('Supabase not configured (dummy mode).')
  }
  if (!cachedClient) {
    const { createClient } = await import('@supabase/supabase-js')
    cachedClient = createClient(url, anonKey)
  }
  return cachedClient
}
