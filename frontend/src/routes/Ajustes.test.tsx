import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch, descargarArchivo, getUser, signOut } = vi.hoisted(() => ({ apiFetch: vi.fn(), descargarArchivo: vi.fn(), getUser: vi.fn(), signOut: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch, descargarArchivo }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser,
      signOut,
      signInWithPassword: vi.fn(),
      updateUser: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(),
    },
  },
}));

import type { Periodo } from '@/hooks/use-periodo-activo';
import type { Suscripcion } from '@/hooks/use-suscripcion';
import { ApiError } from '@/lib/api';
import { Ajustes } from '@/routes/Ajustes';
import { useAuthStore } from '@/stores/auth-store';
import { instalarServidorFalso, type Rutas, type ServidorFalso } from '@/test/servidor-falso';
import { renderEnRuta } from '@/test/utilidades';

const gratis: Suscripcion = { plan: 'free', estadoSuscripcion: null, suscripcionVigenteHasta: null, cobrosHabilitados: false, avisoProSolicitadoEn: null };
const activo: Periodo = { id: 'p1', cuentaId: 'c1', estado: 'activo', fechaInicio: '2026-10-01', fechaFin: '2026-10-15', creadoEn: '2026-10-01T12:00:00Z' };

const sinPeriodoActivo = () => {
  throw new ApiError(404, 'PERIODO_NO_ENCONTRADO', 'No hay un periodo activo');
};

function rutas(extra: Rutas = {}): Rutas {
  return {
    '/preferencias': { recibirRecordatorios: true },
    '/suscripcion': gratis,
    '/periodos/activo': activo,
    ...extra,
  };
}

let servidor: ServidorFalso;

beforeEach(() => {
  descargarArchivo.mockReset().mockResolvedValue(undefined);
  signOut.mockReset().mockResolvedValue({ error: null });
  getUser.mockReset().mockResolvedValue({ data: { user: { email: 'yo@correo.com' } } });
  useAuthStore.setState({ session: { user: { email: 'yo@correo.com' } } as never, cargando: false });
});

const montar = (entrada = '/ajustes') => renderEnRuta(<Ajustes />, { path: '/ajustes', entrada });

/** El bloque (tarjeta con su título en mayúsculas) de la pantalla, para comprobar qué vive dónde. */
const seccion = (titulo: string) => screen.getByRole('heading', { name: titulo }).closest('section') as HTMLElement;

describe('Ajustes — cuenta', () => {
  it('muestra el correo de la cuenta con su inicial y "Cerrar sesión" cierra la sesión', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    montar();

    const cuenta = await waitFor(() => seccion('CUENTA'));
    expect(within(cuenta).getByText('yo@correo.com')).toBeInTheDocument();
    expect(within(cuenta).getByText('Y')).toBeInTheDocument();

    await usuario.click(within(cuenta).getByRole('button', { name: 'Cerrar sesión' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('sin usuario todavía no hay tarjeta de cuenta', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    servidor = instalarServidorFalso(apiFetch, rutas());
    montar();

    await screen.findByRole('heading', { name: 'SEGURIDAD' });
    expect(screen.queryByRole('heading', { name: 'CUENTA' })).not.toBeInTheDocument();
  });

  it('"Cerrar sesión" y "Cerrar periodo" viven en secciones distintas (un usuario real confundió uno con el otro)', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    montar();

    const cuenta = await waitFor(() => seccion('CUENTA'));
    const periodo = seccion('PERIODO');
    expect(cuenta).not.toBe(periodo);
    expect(within(cuenta).getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(within(cuenta).queryByText(/Cerrar este periodo/)).not.toBeInTheDocument();
    expect(within(periodo).queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
    expect(within(periodo).getByRole('button', { name: /Cerrar este periodo/ })).toBeInTheDocument();
  });
});

describe('Ajustes — plan y suscripción', () => {
  it('muestra la tarjeta del plan con lo que dice el servidor', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    montar();

    expect(await screen.findByText('Plan gratuito')).toBeInTheDocument();
    expect(screen.getByText('Korly Pro llegará pronto')).toBeInTheDocument();
  });

  it('al volver de Stripe con éxito, avisa que la suscripción se está confirmando', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    montar('/ajustes?suscripcion=exito');

    expect(await screen.findByText('Listo — tu suscripción se está confirmando.')).toBeInTheDocument();
  });

  it('sin ese parámetro no muestra el aviso', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    montar();

    await screen.findByText('Plan gratuito');
    expect(screen.queryByText(/se está confirmando/)).not.toBeInTheDocument();
  });
});

describe('Ajustes — recordatorios por correo', () => {
  it('refleja si los recordatorios están activados', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/preferencias': { recibirRecordatorios: false } }));
    montar();

    expect(await screen.findByText('Recordatorios por correo')).toBeInTheDocument();
    expect(within(seccion('NOTIFICACIONES')).getByRole('checkbox')).not.toBeChecked();
  });

  it('apagarlos manda la preferencia nueva y la pantalla vuelve a leerla', async () => {
    let guardada = { recibirRecordatorios: true };
    servidor = instalarServidorFalso(apiFetch, rutas({ '/preferencias': () => guardada, 'PATCH /preferencias': (init?: RequestInit) => { guardada = JSON.parse(String(init?.body)); return guardada; } }));
    const usuario = userEvent.setup();
    montar();

    const casilla = within(await waitFor(() => seccion('NOTIFICACIONES'))).getByRole('checkbox');
    expect(casilla).toBeChecked();
    await usuario.click(casilla);

    await waitFor(() => expect(servidor.llamadasA('PATCH', '/preferencias')).toHaveLength(1));
    expect(servidor.llamadasA('PATCH', '/preferencias')[0]?.cuerpo).toEqual({ recibirRecordatorios: false });
    await waitFor(() => expect(within(seccion('NOTIFICACIONES')).getByRole('checkbox')).not.toBeChecked());
  });

  it('si no se pudo guardar, lo dice', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'PATCH /preferencias': () => { throw new ApiError(500, 'ERROR_INTERNO', 'No se pudo guardar tu preferencia') } }));
    const usuario = userEvent.setup();
    montar();

    await usuario.click(within(await waitFor(() => seccion('NOTIFICACIONES'))).getByRole('checkbox'));

    expect(await screen.findByText('No se pudo guardar tu preferencia')).toBeInTheDocument();
  });

  it('si no cargan las preferencias, muestra el error y no pinta la sección de notificaciones', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/preferencias': () => { throw new ApiError(500, 'ERROR_INTERNO', 'No se pudieron leer tus preferencias') } }));
    montar();

    expect(await screen.findByText('No se pudieron leer tus preferencias')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'NOTIFICACIONES' })).not.toBeInTheDocument();
  });
});

describe('Ajustes — seguridad', () => {
  it('ofrece cambiar la contraseña y el correo (cerrados hasta que se piden)', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    montar();

    const seguridad = await waitFor(() => seccion('SEGURIDAD'));
    expect(within(seguridad).getByRole('button', { name: 'Cambiar contraseña' })).toBeInTheDocument();
    expect(within(seguridad).getByRole('button', { name: 'Cambiar correo' })).toBeInTheDocument();
    expect(within(seguridad).queryByLabelText('Contraseña actual')).not.toBeInTheDocument();
  });
});

describe('Ajustes — cerrar el periodo', () => {
  it('sin periodo abierto lo dice y no ofrece cerrar nada', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/periodos/activo': sinPeriodoActivo }));
    montar();

    expect(await screen.findByText('No tienes un periodo abierto en este momento.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cerrar este periodo/ })).not.toBeInTheDocument();
  });

  it('exige escribir CERRAR (sin importar mayúsculas ni espacios) antes de poder cerrar, y avisa que cerrar sesión es otra cosa', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'POST /periodos/p1/cerrar': { periodoId: 'p1' } }));
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: /Cerrar este periodo/ }));
    const hoja = await screen.findByRole('dialog', { name: 'Cerrar periodo' });
    expect(within(hoja).getByText(/¿Querías salir de tu cuenta\?/)).toBeInTheDocument();
    const cerrar = within(hoja).getByRole('button', { name: 'Cerrar periodo' });
    expect(cerrar).toBeDisabled();

    await usuario.type(within(hoja).getByLabelText(/Para confirmar, escribe CERRAR/), 'cerr');
    expect(cerrar).toBeDisabled();
    await usuario.type(within(hoja).getByLabelText(/Para confirmar, escribe CERRAR/), 'ar  ');
    expect(cerrar).toBeEnabled();
  });

  it('confirmado, cierra ese periodo y lleva a su resumen', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'POST /periodos/p1/cerrar': { periodoId: 'p1', sobrante: { valorMinimo: 0, moneda: 'MXN' } } }));
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: /Cerrar este periodo/ }));
    const hoja = await screen.findByRole('dialog', { name: 'Cerrar periodo' });
    await usuario.type(within(hoja).getByLabelText(/Para confirmar/), 'CERRAR');
    await usuario.click(within(hoja).getByRole('button', { name: 'Cerrar periodo' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/periodos/p1/cerrar')).toHaveLength(1));
    expect(await screen.findByTestId('otra-ruta')).toBeInTheDocument(); // navegó a /resumen/p1
  });

  it('"Cancelar" cierra la hoja sin cerrar el periodo', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: /Cerrar este periodo/ }));
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(servidor.llamadasA('POST', '/periodos/p1/cerrar')).toHaveLength(0);
  });

  it('si el servidor no deja cerrarlo, la hoja sigue abierta con el motivo', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'POST /periodos/p1/cerrar': () => { throw new ApiError(409, 'PERIODO_YA_CERRADO', 'Ese periodo ya estaba cerrado') } }));
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: /Cerrar este periodo/ }));
    const hoja = await screen.findByRole('dialog', { name: 'Cerrar periodo' });
    await usuario.type(within(hoja).getByLabelText(/Para confirmar/), 'CERRAR');
    await usuario.click(within(hoja).getByRole('button', { name: 'Cerrar periodo' }));

    expect(await within(hoja).findByText('Ese periodo ya estaba cerrado')).toBeInTheDocument();
    expect(screen.queryByTestId('otra-ruta')).not.toBeInTheDocument();
  });
});

describe('Ajustes — ayuda, privacidad y datos', () => {
  it('enlaza el aviso de privacidad, los términos, las categorías y los gastos recurrentes', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    montar();

    await screen.findByText('Plan gratuito');
    expect(screen.getByRole('link', { name: /Aviso de privacidad/ })).toHaveAttribute('href', '/privacidad');
    expect(screen.getByRole('link', { name: /Términos y condiciones/ })).toHaveAttribute('href', '/terminos');
    expect(screen.getByRole('link', { name: /Categorías/ })).toHaveAttribute('href', '/categorias');
    expect(screen.getByRole('link', { name: /Gastos recurrentes/ })).toHaveAttribute('href', '/recurrentes');
  });

  it('"Enviar comentarios" abre el formulario', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: /Enviar comentarios/ }));

    expect(await screen.findByRole('dialog', { name: 'Enviar comentarios' })).toBeInTheDocument();
  });

  it('"Descargar mis datos" baja el archivo de la cuenta', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Descargar mis datos' }));

    await waitFor(() => expect(descargarArchivo).toHaveBeenCalledWith('/cuenta/datos', 'korly-mis-datos.json'));
  });

  it('si la descarga falla, lo dice', async () => {
    descargarArchivo.mockRejectedValue(new Error('No se pudo preparar tu archivo'));
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Descargar mis datos' }));

    expect(await screen.findByText('No se pudo preparar tu archivo')).toBeInTheDocument();
  });
});

describe('Ajustes — eliminar la cuenta', () => {
  it('pide escribir ELIMINAR exacto y no manda nada antes', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    const borrar = screen.getByRole('button', { name: 'Eliminar para siempre' });
    expect(borrar).toBeDisabled();
    await usuario.type(screen.getByLabelText(/Para confirmar, escribe ELIMINAR/), 'eliminar'); // en minúsculas no vale
    expect(borrar).toBeDisabled();

    expect(servidor.llamadasA('POST', '/cuenta/eliminar')).toHaveLength(0);
  });

  it('confirmada, la elimina en el servidor y cierra la sesión local', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'POST /cuenta/eliminar': { usuarioAuthEliminado: true } }));
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    await usuario.type(screen.getByLabelText(/Para confirmar, escribe ELIMINAR/), 'ELIMINAR');
    await usuario.click(screen.getByRole('button', { name: 'Eliminar para siempre' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/cuenta/eliminar')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/cuenta/eliminar')[0]?.cuerpo).toEqual({ confirmacion: 'ELIMINAR' });
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: 'local' }));
  });

  it('"Cancelar" cierra la confirmación y no elimina nada', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    await usuario.type(screen.getByLabelText(/Para confirmar/), 'ELIMINAR');
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText(/Para confirmar, escribe ELIMINAR/)).not.toBeInTheDocument();
    expect(servidor.llamadasA('POST', '/cuenta/eliminar')).toHaveLength(0);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('si el servidor falla, muestra el error y NO cierra la sesión (la cuenta sigue ahí)', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'POST /cuenta/eliminar': () => { throw new ApiError(500, 'ERROR_INTERNO', 'No se pudo eliminar tu cuenta') } }));
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    await usuario.type(screen.getByLabelText(/Para confirmar/), 'ELIMINAR');
    await usuario.click(screen.getByRole('button', { name: 'Eliminar para siempre' }));

    expect(await screen.findByText('No se pudo eliminar tu cuenta')).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });
});
