import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export type EstadoSuscripcion = 'trialing' | 'activa' | 'pago_pendiente' | 'cancelada' | null;

export interface Suscripcion {
  plan: 'free' | 'pro';
  estadoSuscripcion: EstadoSuscripcion;
  suscripcionVigenteHasta: string | null;
  /** `false` mientras Korly Pro es "próximamente": se muestra "Avísame" en vez de los botones de pago. */
  cobrosHabilitados: boolean;
  avisoProSolicitadoEn: string | null;
}

export function useSuscripcion() {
  return useQuery({
    queryKey: ['suscripcion'],
    queryFn: () => apiFetch<Suscripcion>('/suscripcion'),
  });
}
