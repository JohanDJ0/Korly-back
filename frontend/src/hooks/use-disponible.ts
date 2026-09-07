import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

export interface DisponibleSinIngreso {
  estado: 'sin_ingreso';
  periodoId: string;
  calculadoEn: string;
}

export interface DisponibleOk {
  estado: 'ok';
  periodoId: string;
  disponible: MontoDto;
  diasRestantes: number;
  cifraDiaria: MontoDto;
  /** Extensión sobre openapi.yaml (ver backend/README.md, "Disponible") — cuánto se ha gastado hoy específicamente. */
  gastadoHoy: MontoDto;
  calculadoEn: string;
}

export type Disponible = DisponibleSinIngreso | DisponibleOk;

/**
 * Sin reintentos: un 404 (sin periodo activo) es un estado esperado del
 * dominio, no una falla transitoria de red — reintentarlo solo demora
 * mostrar el CTA de "crear periodo" (ver Home.tsx).
 */
export function useDisponible() {
  return useQuery({
    queryKey: ['disponible'],
    queryFn: () => apiFetch<Disponible>('/periodos/activo/disponible'),
    retry: false,
  });
}
