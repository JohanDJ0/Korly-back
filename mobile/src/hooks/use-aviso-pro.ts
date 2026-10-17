// Copia de frontend/src/hooks/use-aviso-pro.ts (sin cambios; regenerar con mobile/herramientas/copiar-de-la-web.mjs). Fase 3: paquete compartido.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

/**
 * "Avísame cuando Korly Pro esté disponible" y su opuesto. Solo guardan (o
 * borran) la fecha en que el usuario lo pidió; no tocan Stripe. Al terminar
 * se recarga la suscripción, que es de donde la pantalla lee el estado.
 */
export function useAvisoPro() {
  const queryClient = useQueryClient();
  const alTerminar = () => {
    void queryClient.invalidateQueries({ queryKey: ['suscripcion'] });
  };

  const pedir = useMutation({
    mutationFn: () => apiFetch<{ avisoProSolicitadoEn: string }>('/suscripcion/aviso-pro', { method: 'POST' }),
    onSuccess: alTerminar,
  });
  const cancelar = useMutation({
    mutationFn: () => apiFetch<void>('/suscripcion/aviso-pro', { method: 'DELETE' }),
    onSuccess: alTerminar,
  });

  return { pedir, cancelar };
}
