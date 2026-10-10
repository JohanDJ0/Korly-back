import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }), onAuthStateChange: vi.fn() } },
}));
vi.mock('@/components/Sidebar', () => ({ Sidebar: () => null }));

import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { useAuthStore } from '@/stores/auth-store';

/** Hace visible a dónde mandó ProtectedRoute y qué estado de navegación llevó. */
function PantallaLogin() {
  const { state } = useLocation();
  return <p data-testid="login">{JSON.stringify(state)}</p>;
}

function montar(entrada: string) {
  return render(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes>
        <Route path="/login" element={<PantallaLogin />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<p>Home</p>} />
          <Route path="/historial" element={<p>Historial</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useAuthStore.setState({ session: null, cargando: false, esRecuperacion: false });
});

describe('ProtectedRoute — sin sesión', () => {
  it('manda a /login recordando a dónde se quería entrar, con su query (el enlace del recordatorio)', () => {
    montar('/?gasto=1');

    expect(screen.getByTestId('login')).toHaveTextContent(JSON.stringify({ desde: '/?gasto=1' }));
  });

  it('también recuerda otras pantallas', () => {
    montar('/historial?x=2');

    expect(screen.getByTestId('login')).toHaveTextContent(JSON.stringify({ desde: '/historial?x=2' }));
  });
});
