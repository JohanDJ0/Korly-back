import { useCallback } from 'react';

import { formatearMonto, type MontoDto } from '@/lib/dinero';
import { usePrivacidadStore } from '@/stores/privacidad-store';

/** Lo que se ve en lugar de un monto cuando el usuario activó el ojito. */
export const MONTO_OCULTO = '$ ••••';

/**
 * Único camino para mostrar un monto en pantalla: igual que `formatearMonto`, pero respeta el ojito de privacidad.
 * Cualquier componente que muestre dinero debe usar esto y no `formatearMonto` directo, o esa cifra se queda a la
 * vista aunque el usuario haya ocultado los montos (hay una prueba que vigila que no se cuele ninguna).
 * Se suscribe al estado, así que todo lo que lo use se vuelve a pintar al instante cuando se alterna.
 */
export function useFormatearMonto(): (monto: MontoDto) => string {
  const oculto = usePrivacidadStore((s) => s.oculto);
  return useCallback((monto: MontoDto) => (oculto ? MONTO_OCULTO : formatearMonto(monto)), [oculto]);
}
