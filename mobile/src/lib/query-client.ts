import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

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

/**
 * En el navegador TanStack Query vuelve a pedir los datos al regresar a la pestaña; en el teléfono no sabe cuándo la app
 * vuelve a primer plano, así que se le avisa con AppState (receta oficial para React Native). Sin esto, una app que se
 * queda abierta de un día para otro seguiría mostrando la cifra de ayer.
 */
AppState.addEventListener('change', (estado: AppStateStatus) => {
  focusManager.setFocused(estado === 'active');
});
