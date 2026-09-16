import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

export interface Tarjeta {
  id: string;
  nombre: string;
  limiteCredito: MontoDto;
  /** Siempre positivo — la convención negativa del ledger nunca cruza el límite HTTP (ver backend/README.md, "Tarjetas de crédito y MSI"). */
  deuda: MontoDto;
  creditoDisponible: MontoDto;
  diaCorte: number;
  diasParaPago: number;
}

export function useTarjetas() {
  return useQuery({
    queryKey: ['tarjetas'],
    queryFn: () => apiFetch<Tarjeta[]>('/tarjetas'),
  });
}
