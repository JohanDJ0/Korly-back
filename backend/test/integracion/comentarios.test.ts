import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { enviarComentario, validarComentario } from '../../src/modulos/comentarios/comentarios.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import type { CorreoEntrada } from '../../src/shared/email.js';

describe('enviarComentario', () => {
  async function tenantNuevo() {
    const idEnProveedor = `test-comentarios-${randomUUID()}`;
    const { tenantId } = await resolverOcrearIdentidad(idEnProveedor);
    return { tenantId, idEnProveedor };
  }

  it('manda a soporte el comentario con el id de la cuenta, sin el correo si la persona no lo autorizó (y ni siquiera lo consulta)', async () => {
    const { tenantId } = await tenantNuevo();
    const enviar = vi.fn<(correo: CorreoEntrada) => Promise<void>>().mockResolvedValue();
    const resolverCorreo = vi.fn().mockResolvedValue('yo@correo.com');

    await enviarComentario(tenantId, validarComentario({ tipo: 'idea', mensaje: 'Quiero exportar a Excel', pantalla: '/ajustes' }), { enviar, resolverCorreo });

    expect(enviar).toHaveBeenCalledTimes(1);
    const correo = enviar.mock.calls[0]![0];
    expect(correo.asunto).toBe('[Korly] Idea: Quiero exportar a Excel');
    expect(correo.textoPlano).toContain(`Cuenta: ${tenantId}`);
    expect(correo.responderA).toBeUndefined();
    expect(resolverCorreo).not.toHaveBeenCalled();
  });

  it('con la casilla marcada averigua el correo de la persona a través de su identidad y lo pone de "responder a"', async () => {
    const { tenantId, idEnProveedor } = await tenantNuevo();
    const enviar = vi.fn<(correo: CorreoEntrada) => Promise<void>>().mockResolvedValue();
    const resolverCorreo = vi.fn().mockResolvedValue('persona@correo.com');

    await enviarComentario(tenantId, validarComentario({ tipo: 'problema', mensaje: 'Algo falla', responder: true }), { enviar, resolverCorreo });

    expect(resolverCorreo).toHaveBeenCalledWith(idEnProveedor);
    expect(enviar.mock.calls[0]![0].responderA).toBe('persona@correo.com');
  });

  it('si no se puede averiguar el correo, el comentario se manda igual (sin "responder a")', async () => {
    const { tenantId } = await tenantNuevo();
    const enviar = vi.fn<(correo: CorreoEntrada) => Promise<void>>().mockResolvedValue();
    const resolverCorreo = vi.fn().mockRejectedValue(new Error('Supabase caído'));

    await enviarComentario(tenantId, validarComentario({ tipo: 'otro', mensaje: 'Hola', responder: true }), { enviar, resolverCorreo });

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0]![0].responderA).toBeUndefined();
    expect(enviar.mock.calls[0]![0].textoPlano).toContain('no se pudo obtener su correo');
  });

  it('si el proveedor de correo falla, el error sube (la persona ve que no se envió, no un falso "enviado")', async () => {
    const { tenantId } = await tenantNuevo();
    const enviar = vi.fn().mockRejectedValue(new Error('Resend rechazó el envío'));

    await expect(enviarComentario(tenantId, validarComentario({ tipo: 'otro', mensaje: 'Hola' }), { enviar })).rejects.toThrow('Resend rechazó el envío');
  });

  it('sin proveedor de correo configurado (sin RESEND_API_KEY) avisa con COMENTARIOS_NO_DISPONIBLES en vez de aparentar que envió', async () => {
    const { tenantId } = await tenantNuevo();

    await expect(enviarComentario(tenantId, validarComentario({ tipo: 'otro', mensaje: 'Hola' }))).rejects.toMatchObject({ codigo: 'COMENTARIOS_NO_DISPONIBLES' });
  });
});
