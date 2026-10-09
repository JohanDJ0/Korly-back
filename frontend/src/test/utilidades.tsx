import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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

/** Como `renderConProveedores`, pero con una ruta de verdad (`path` con parámetros) y la URL inicial: para pantallas que leen `:periodoId` o `?desglose=1`. */
export function renderEnRuta(ui: ReactElement, { path, entrada }: { path: string; entrada: string }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entrada]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="*" element={<p data-testid="otra-ruta">otra ruta</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...resultado, queryClient };
}
