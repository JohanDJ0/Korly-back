import { QueryClient } from '@tanstack/react-query';

/**
 * Instancia única, importada tanto por App.tsx (el Provider) como por
 * stores/auth-store.ts (para vaciarla al cambiar de usuario) — evita
 * depender de un Context de React para algo que necesita dispararse
 * desde fuera del árbol de componentes.
 */
export const queryClient = new QueryClient();
