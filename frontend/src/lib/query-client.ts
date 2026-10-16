import { QueryClient } from '@tanstack/react-query';

/**
 * Cuándo reintentar una consulta que falló. Un error 4xx (404 "sin periodo activo", 401, 400...) es un estado esperado del
 * dominio y reintentarlo solo demora mostrar la pantalla que corresponde; un 5xx o un fallo de red (sin `status`) suele ser
 * pasajero —p. ej. el servidor tropezó un instante— y se arregla solo: dos reintentos con la espera por omisión (1 s, 2 s)
 * y la persona nunca ve el error ni tiene que recargar la página (en una app instalada en el teléfono, ni siquiera puede).
 */
export function reintentarSiFallaElServidor(intentos: number, error: Error): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status < 500) return false;
  return intentos < 2;
}

/**
 * Instancia única, importada tanto por App.tsx (el Provider) como por
 * stores/auth-store.ts (para vaciarla al cambiar de usuario) — evita
 * depender de un Context de React para algo que necesita dispararse
 * desde fuera del árbol de componentes.
 */
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: reintentarSiFallaElServidor } } });
