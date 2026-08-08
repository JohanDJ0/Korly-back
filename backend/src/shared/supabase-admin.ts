import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno');
}

/**
 * Cliente con la service role key, usado únicamente en el servidor para
 * validar el JWT de un usuario contra Supabase Auth (auth.getUser). El
 * token nunca se usa directamente como identificador de dominio (ADR-003).
 */
export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
