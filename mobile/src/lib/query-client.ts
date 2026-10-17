import { QueryClient } from '@tanstack/react-query';

/**
 * Misma política que la web (frontend/src/lib/query-client.ts): un 4xx es un estado esperado del dominio (404 "sin periodo
 * activo", 401...) y no se reintenta; un 5xx o un fallo de red suele ser pasajero y se reintenta dos veces. En el teléfono
 * importa más: la conexión va y viene y no hay botón de recargar.
 */
export function reintentarSiFallaElServidor(intentos: number, error: Error): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status < 500) return false;
  return intentos < 2;
}

export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: reintentarSiFallaElServidor } } });
