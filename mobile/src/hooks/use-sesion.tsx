import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

interface EstadoSesion {
  session: Session | null;
  /** true solo hasta leer la sesión guardada al abrir la app. */
  cargando: boolean;
}

const ContextoSesion = createContext<EstadoSesion>({ session: null, cargando: true });

/**
 * Sesión de Supabase para toda la app (equivale a stores/auth-store.ts de la web). Al cambiar de usuario se vacía la caché
 * de TanStack Query: sin eso, los datos de la cuenta anterior se alcanzan a ver un instante con la nueva (hallazgo real
 * de la web, no hipotético).
 */
export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>({ session: null, cargando: true });
  const usuarioActual = useRef<string | undefined>(undefined);

  useEffect(() => {
    function sincronizar(session: Session | null) {
      const nuevo = session?.user.id;
      if (nuevo !== usuarioActual.current) queryClient.clear();
      usuarioActual.current = nuevo;
      setEstado({ session, cargando: false });
    }
    void supabase.auth.getSession().then(({ data }) => sincronizar(data.session));
    const { data } = supabase.auth.onAuthStateChange((_evento, session) => sincronizar(session));
    return () => data.subscription.unsubscribe();
  }, []);

  return <ContextoSesion.Provider value={estado}>{children}</ContextoSesion.Provider>;
}

export function useSesion(): EstadoSesion {
  return useContext(ContextoSesion);
}
