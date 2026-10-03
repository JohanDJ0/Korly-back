import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';

/**
 * Derecho de cancelación (ARCO): borra la cuenta y todos sus datos, sin
 * vuelta atrás (backend/README.md, "Privacidad y derechos ARCO"). El
 * usuario de Supabase Auth ya no existe al terminar, así que el cierre de
 * sesión es solo local — no hay servidor al que avisarle.
 */
export function useEliminarCuenta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (confirmacion: string) => apiFetch<{ usuarioAuthEliminado: boolean }>('/cuenta/eliminar', { method: 'POST', body: JSON.stringify({ confirmacion }) }),
    onSuccess: async () => {
      queryClient.clear();
      await supabase.auth.signOut({ scope: 'local' });
    },
  });
}
