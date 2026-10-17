import { useCallback } from 'react';

import { formatearMonto, type MontoDto } from '@/lib/dinero';
import { usePrivacidadStore } from '@/stores/privacidad-store';

/** Lo que se ve en lugar de un monto cuando el usuario activó el ojito. */
export const MONTO_OCULTO = '$ ••••';

/**
 * Único camino para mostrar un monto en pantalla (igual que en la web): respeta el ojito de privacidad. Nunca uses
 * `formatearMonto` directo en un componente, o esa cifra se queda a la vista aunque el usuario haya ocultado los montos.
 */
export function useFormatearMonto(): (monto: MontoDto) => string {
  const oculto = usePrivacidadStore((s) => s.oculto);
  return useCallback((monto: MontoDto) => (oculto ? MONTO_OCULTO : formatearMonto(monto)), [oculto]);
}
