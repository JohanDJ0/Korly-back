import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY en mobile/.env (ver .env.example)');
}

/**
 * Único cliente de Supabase de la app — solo para Auth (login, sesión), igual que en la web (frontend/src/lib/supabase.ts).
 * Los datos vienen del backend propio (lib/api.ts). La sesión se guarda en el `localStorage` que instala expo-sqlite
 * (guía de Supabase de Expo): sobrevive a cerrar la app. `detectSessionInUrl: false` porque en el teléfono no hay URL
 * de la que leer una sesión.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// El refresco automático del token solo corre con la app en primer plano (recomendación de Supabase para móvil).
AppState.addEventListener('change', (estado) => {
  if (estado === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
