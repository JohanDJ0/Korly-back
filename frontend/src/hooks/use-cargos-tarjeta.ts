import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

export interface MensualidadCargo {
  numeroPago: number;
  monto: MontoDto;
  fechaVencimiento: string;
  pagado: boolean;
}

export interface CargoTarjeta {
  id: string;
  descripcion: string;
  montoTotal: MontoDto;
  numeroPlazos: number;
  categoriaId: string | null;
  fechaCompra: string;
  mensualidades: MensualidadCargo[];
}

/** Extensión propia (ver backend/README.md) — el detalle de compras y mensualidades de una tarjeta, solo se pide cuando el usuario expande la tarjeta. */
export function useCargosTarjeta(tarjetaId: string | undefined) {
  return useQuery({
    queryKey: ['cargos-tarjeta', tarjetaId],
    queryFn: () => apiFetch<CargoTarjeta[]>(`/tarjetas/${tarjetaId}/cargos`),
    enabled: tarjetaId !== undefined,
  });
}
