import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en el .env (ver .env.example)');
}

/**
 * Único cliente de Supabase de la app — solo para Auth (login, sesión).
 * El resto de los datos vienen del backend propio (src/lib/api.ts), nunca
 * directo de Supabase: el frontend no habla con Postgres.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
