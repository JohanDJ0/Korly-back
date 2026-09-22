import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export type EstadoSuscripcion = 'trialing' | 'activa' | 'pago_pendiente' | 'cancelada' | null;

export interface Suscripcion {
  plan: 'free' | 'pro';
  estadoSuscripcion: EstadoSuscripcion;
  suscripcionVigenteHasta: string | null;
}

export function useSuscripcion() {
  return useQuery({
    queryKey: ['suscripcion'],
    queryFn: () => apiFetch<Suscripcion>('/suscripcion'),
  });
}
