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
  /**
   * `gastadoHoy === 0` no significa "no pasó nada hoy" — un retiro de
   * meta que cubre un gasto el mismo día también da neto cero. Usar
   * este campo (no `gastadoHoy`) para decidir si el usuario ya hizo
   * algo hoy (ver RecordatorioContextual.tsx).
   */
  huboActividadHoy: boolean;
  calculadoEn: string;
}

export type Disponible = DisponibleSinIngreso | DisponibleOk;

/**
 * Un 404 (sin periodo activo) es un estado esperado del dominio, no una falla
 * transitoria de red: no se reintenta, para no demorar el CTA de "crear periodo"
 * (ver Home.tsx). Un 5xx o un fallo de red sí se reintenta solo: lo decide el
 * QueryClient de la app (`reintentarSiFallaElServidor`, lib/query-client.ts).
 */
export function useDisponible() {
  return useQuery({
    queryKey: ['disponible'],
    queryFn: () => apiFetch<Disponible>('/periodos/activo/disponible'),
  });
}
