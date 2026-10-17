// Copia de frontend/src/hooks/use-desglose.ts (sin cambios; regenerar con mobile/herramientas/copiar-de-la-web.mjs). Fase 3: paquete compartido.
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

export interface RubroDesglose {
  clave: string;
  etiqueta: string;
  tipo: 'categoria' | 'sin_categoria' | 'pagos_tarjeta';
  monto: MontoDto;
}

export interface SemanaDesglose {
  numero: number;
  fechaInicio: string;
  fechaFin: string;
  dias: number;
  /** Días del bloque que ya pasaron — menos que `dias` solo en la semana en curso del periodo activo. */
  diasTranscurridos: number;
  total: MontoDto;
  promedioDiario: MontoDto;
  rubros: { clave: string; monto: MontoDto }[];
}

export interface RecurrenteDesglose {
  id: string;
  descripcion: string;
  frecuencia: string;
  diaMes: number | null;
  monto: MontoDto;
}

export interface Desglose {
  periodoId: string;
  fechaInicio: string;
  fechaFin: string;
  totalGastado: MontoDto;
  /** `totalGastado` menos los recurrentes y los aportes a metas — lo que cubren `rubros` y `semanas`. */
  totalVariable: MontoDto;
  recurrentes: { total: MontoDto; items: RecurrenteDesglose[] };
  /** Lo aportado a metas (neto de lo que volvió como retiro): ahorro, aparte del análisis por rubro y semana. */
  aportesAMetas: { total: MontoDto };
  rubros: RubroDesglose[];
  semanas: SemanaDesglose[];
  semanaMasCara: number | null;
}

/** Extensión propia (ver backend/README.md, "Desglose del periodo") — funciona igual para un periodo cerrado que para el activo. */
export function useDesglose(periodoId: string | undefined) {
  return useQuery({
    queryKey: ['desglose', periodoId],
    queryFn: () => apiFetch<Desglose>(`/periodos/${periodoId}/desglose`),
    enabled: periodoId !== undefined,
  });
}
