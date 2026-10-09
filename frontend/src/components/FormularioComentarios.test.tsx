import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));

import { BotonComentarios } from '@/components/BotonComentarios';
import { FormularioComentarios } from '@/components/FormularioComentarios';
import { ApiError } from '@/lib/api';

function montar(ui: React.ReactElement, ruta = '/historial') {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[ruta]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  apiFetch.mockReset().mockResolvedValue(undefined);
});

describe('FormularioComentarios', () => {
  it('sin escribir nada no manda nada y pide el comentario', async () => {
    const usuario = userEvent.setup();
    montar(<FormularioComentarios onCerrar={() => {}} />);

    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Escribe tu comentario')).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('manda el tipo elegido, el texto sin espacios de más y la pantalla donde estaba; por omisión NO autoriza que le escriban', async () => {
    const usuario = userEvent.setup();
    montar(<FormularioComentarios onCerrar={() => {}} />, '/tarjetas');

    await usuario.click(screen.getByRole('radio', { name: 'Tengo una idea' }));
    await usuario.type(screen.getByLabelText('Tu comentario'), '  Quiero ver mis MSI  ');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const [ruta, init] = apiFetch.mock.calls[0]!;
    expect(ruta).toBe('/comentarios');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ tipo: 'idea', mensaje: 'Quiero ver mis MSI', pantalla: '/tarjetas', responder: false });
  });

  it('empieza en "Algo falla" y la casilla de responder viene sin marcar', () => {
    montar(<FormularioComentarios onCerrar={() => {}} />);

    expect(screen.getByRole('radio', { name: 'Algo falla' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('con la casilla marcada lo manda así y el agradecimiento lo menciona', async () => {
    const usuario = userEvent.setup();
    montar(<FormularioComentarios onCerrar={() => {}} />);

    await usuario.type(screen.getByLabelText('Tu comentario'), 'La cifra no cuadra');
    await usuario.click(screen.getByRole('checkbox'));
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Tu comentario ya llegó al equipo de Korly.*te escribiremos a tu correo/);
    expect(JSON.parse(apiFetch.mock.calls[0]![1].body).responder).toBe(true);
  });

  it('al terminar muestra el agradecimiento y "Cerrar" cierra', async () => {
    const usuario = userEvent.setup();
    const onCerrar = vi.fn();
    montar(<FormularioComentarios onCerrar={onCerrar} />);

    await usuario.type(screen.getByLabelText('Tu comentario'), 'Gracias');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));
    await usuario.click(await screen.findByRole('button', { name: 'Cerrar' }));

    expect(onCerrar).toHaveBeenCalled();
  });

  it('si falla el envío, lo dice y conserva lo que la persona escribió', async () => {
    apiFetch.mockRejectedValue(new ApiError(503, 'COMENTARIOS_NO_DISPONIBLES', 'Ahora mismo no podemos recibir comentarios. Escríbenos a soporte@korly.com.mx'));
    const usuario = userEvent.setup();
    montar(<FormularioComentarios onCerrar={() => {}} />);

    await usuario.type(screen.getByLabelText('Tu comentario'), 'Texto largo que no se debe perder');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText(/Escríbenos a soporte@korly.com.mx/)).toBeInTheDocument();
    expect(screen.getByLabelText('Tu comentario')).toHaveValue('Texto largo que no se debe perder');
  });

  it('muestra cuántos caracteres lleva y no deja pasar de 2000', async () => {
    const usuario = userEvent.setup();
    montar(<FormularioComentarios onCerrar={() => {}} />);

    await usuario.type(screen.getByLabelText('Tu comentario'), 'hola');

    expect(screen.getByText('4/2000')).toBeInTheDocument();
    expect(screen.getByLabelText('Tu comentario')).toHaveAttribute('maxlength', '2000');
  });
});

describe('BotonComentarios', () => {
  it('abre el formulario en una hoja y se puede cancelar', async () => {
    const usuario = userEvent.setup();
    montar(<BotonComentarios />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: /Enviar comentarios/ }));
    expect(screen.getByRole('dialog', { name: 'Enviar comentarios' })).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('la versión del menú lateral también lo abre', async () => {
    const usuario = userEvent.setup();
    montar(<BotonComentarios variante="menu" />);

    await usuario.click(screen.getByRole('button', { name: 'Enviar comentarios' }));

    expect(screen.getByRole('dialog', { name: 'Enviar comentarios' })).toBeInTheDocument();
  });
});
