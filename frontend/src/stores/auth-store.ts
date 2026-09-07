import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  /** true solo hasta que se resuelve la sesión inicial al cargar la app. */
  cargando: boolean;
}

export const useAuthStore = create<AuthState>(() => ({
  session: null,
  cargando: true,
}));

void supabase.auth.getSession().then(({ data }) => {
  useAuthStore.setState({ session: data.session, cargando: false });
});

supabase.auth.onAuthStateChange((_evento, session) => {
  useAuthStore.setState({ session, cargando: false });
});
