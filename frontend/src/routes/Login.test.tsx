import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signInWithPassword } = vi.hoisted(() => ({ signInWithPassword: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(),
    },
  },
}));

import { Login } from '@/routes/Login';
import { renderConProveedores } from '@/test/utilidades';

/** Muestra dónde aterrizó el usuario después de entrar. */
function Aterrizaje() {
  const { pathname, search } = useLocation();
  return <p data-testid="aterrizaje">{`${pathname}${search}`}</p>;
}

beforeEach(() => {
  signInWithPassword.mockReset();
  sessionStorage.clear();
});

describe('Login — aviso de sesión expirada', () => {
  it('sin cierre de sesión previo, no muestra ningún aviso', () => {
    renderConProveedores(<Login />);

    expect(screen.queryByText(/Tu sesión expiró/)).not.toBeInTheDocument();
  });

  it('después de que la app cerró la sesión por token vencido, explica qué pasó', () => {
    sessionStorage.setItem('korly:sesion-expirada', '1');

    renderConProveedores(<Login />);

    expect(screen.getByRole('status')).toHaveTextContent('Tu sesión expiró. Inicia sesión de nuevo para continuar.');
  });

  it('el aviso sobrevive a un segundo montaje (el cierre de sesión redirige y luego recarga la página)', () => {
    sessionStorage.setItem('korly:sesion-expirada', '1');

    const primera = renderConProveedores(<Login />);
    primera.unmount();
    renderConProveedores(<Login />);

    expect(screen.getByText(/Tu sesión expiró/)).toBeInTheDocument();
  });

  it('al volver a entrar con éxito, el aviso se limpia para que no reaparezca', async () => {
    sessionStorage.setItem('korly:sesion-expirada', '1');
    signInWithPassword.mockResolvedValue({ error: null });
    const usuario = userEvent.setup();
    renderConProveedores(<Login />);

    await usuario.type(screen.getByLabelText('Correo'), 'yo@correo.com');
    await usuario.type(screen.getByLabelText('Contraseña'), 'secreta');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({ email: 'yo@correo.com', password: 'secreta', options: { captchaToken: undefined } }));
    await waitFor(() => expect(sessionStorage.getItem('korly:sesion-expirada')).toBeNull());
  });

  it('si el inicio de sesión falla, muestra el error de Supabase y no el aviso de expiración', async () => {
    sessionStorage.setItem('korly:sesion-expirada', '1');
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    const usuario = userEvent.setup();
    renderConProveedores(<Login />);

    await usuario.type(screen.getByLabelText('Correo'), 'yo@correo.com');
    await usuario.type(screen.getByLabelText('Contraseña'), 'mala');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument();
    expect(screen.queryByText(/Tu sesión expiró/)).not.toBeInTheDocument();
  });

  it('al entrar, vuelve a donde se quería ir (el enlace del recordatorio: /?gasto=1), no siempre a la raíz', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const usuario = userEvent.setup();
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { desde: '/?gasto=1' } }]}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Aterrizaje />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await usuario.type(screen.getByLabelText('Correo'), 'yo@correo.com');
    await usuario.type(screen.getByLabelText('Contraseña'), 'secreta');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByTestId('aterrizaje')).toHaveTextContent('/?gasto=1');
  });

  it('sin destino recordado, entra a la raíz', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const usuario = userEvent.setup();
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Aterrizaje />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await usuario.type(screen.getByLabelText('Correo'), 'yo@correo.com');
    await usuario.type(screen.getByLabelText('Contraseña'), 'secreta');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByTestId('aterrizaje')).toHaveTextContent(/^\/$/);
  });

  it('un correo inválido se rechaza antes de llamar a Supabase', async () => {
    const usuario = userEvent.setup();
    renderConProveedores(<Login />);

    await usuario.type(screen.getByLabelText('Correo'), 'no-es-correo');
    await usuario.type(screen.getByLabelText('Contraseña'), 'x');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Correo inválido')).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
