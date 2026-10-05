import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

/** Cada prueba, su propia caché: sin reintentos (un error simulado debe verse al instante) y sin tirar datos a mitad de la prueba. */
export function renderConProveedores(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
  return { ...resultado, queryClient };
}

export const pesos = (valorMinimo: number) => ({ valorMinimo, moneda: 'MXN' });
