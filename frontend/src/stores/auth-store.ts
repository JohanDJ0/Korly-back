import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { queryClient } from '@/lib/query-client';
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

let usuarioActualId: string | undefined;

/**
 * Sin esto, los datos del usuario A quedan en la caché de TanStack Query
 * (misma queryKey, p. ej. ['disponible']) y se alcanzan a renderizar
 * junto con el estado del usuario B al cambiar de sesión — se descubrió
 * probando el cambio de usuario real en el navegador, no es hipotético.
 * Vaciar toda la caché es más simple y más seguro que invalidar
 * selectivamente: cualquier query nueva que se agregue después queda
 * cubierta automáticamente, sin tener que acordarse de sumarla a una
 * lista.
 */
function sincronizarSesion(session: Session | null) {
  const nuevoUsuarioId = session?.user.id;
  if (nuevoUsuarioId !== usuarioActualId) {
    queryClient.clear();
  }
  usuarioActualId = nuevoUsuarioId;
  useAuthStore.setState({ session, cargando: false });
}

void supabase.auth.getSession().then(({ data }) => {
  sincronizarSesion(data.session);
});

supabase.auth.onAuthStateChange((_evento, session) => {
  sincronizarSesion(session);
});
