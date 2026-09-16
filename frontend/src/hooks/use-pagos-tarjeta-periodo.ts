import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

export interface PagoTarjetaAplicado {
  tarjetaNombre: string;
  cargoDescripcion: string;
  numeroPago: number;
  numeroPlazos: number;
  monto: MontoDto;
}

/**
 * Hallazgo real: un pago de tarjeta se descuenta solo del disponible
 * (materializar-pagos-tarjeta.ts en el backend) pero nunca aparece en
 * `useGastos` — es un tipo de movimiento distinto, no una fila de
 * `gastos`. Sin esto, la única forma de saber que ya se aplicó era
 * notar a mano que una mensualidad cambió a "Pagado" en Tarjetas. Ver
 * Home.tsx (aviso del periodo activo) e Historial.tsx (cualquier periodo).
 */
export function usePagosTarjetaPeriodo(periodoId: string | undefined) {
  return useQuery({
    queryKey: ['pagos-tarjeta-periodo', periodoId],
    queryFn: () => apiFetch<PagoTarjetaAplicado[]>(`/periodos/${periodoId}/pagos-tarjeta`),
    enabled: periodoId !== undefined,
  });
}
