import { afterEach, describe, expect, it, vi } from 'vitest';
import { construirCorreoComentario, LONGITUD_MAXIMA_MENSAJE, validarComentario } from '../../src/modulos/comentarios/comentarios.js';

afterEach(() => vi.unstubAllEnvs());

describe('validarComentario', () => {
  it('acepta un comentario válido y limpia los espacios', () => {
    expect(validarComentario({ tipo: 'idea', mensaje: '  Quiero ver una gráfica  ', pantalla: '/historial', responder: true })).toEqual({
      tipo: 'idea',
      mensaje: 'Quiero ver una gráfica',
      pantalla: '/historial',
      responder: true,
    });
  });

  it('responder es opcional y por omisión no se le escribe a la persona', () => {
    expect(validarComentario({ tipo: 'problema', mensaje: 'no carga' }).responder).toBe(false);
  });

  it('rechaza lo que no es un objeto, un tipo desconocido, un mensaje vacío o demasiado largo', () => {
    expect(() => validarComentario(undefined)).toThrow(/objeto JSON/);
    expect(() => validarComentario('hola')).toThrow(/objeto JSON/);
    expect(() => validarComentario({ tipo: 'queja', mensaje: 'x' })).toThrow(/'tipo'/);
    expect(() => validarComentario({ tipo: 'idea', mensaje: '   ' })).toThrow(/Escribe tu comentario/);
    expect(() => validarComentario({ tipo: 'idea' })).toThrow(/Escribe tu comentario/);
    expect(() => validarComentario({ tipo: 'idea', mensaje: 'a'.repeat(LONGITUD_MAXIMA_MENSAJE + 1) })).toThrow(/no puede pasar de 2000/);
    expect(() => validarComentario({ tipo: 'idea', mensaje: 'a'.repeat(LONGITUD_MAXIMA_MENSAJE) })).not.toThrow();
    expect(() => validarComentario({ tipo: 'idea', mensaje: 'x', responder: 'si' })).toThrow(/'responder'/);
  });

  it('solo conserva la pantalla si tiene forma de ruta de la app; cualquier otra cosa se descarta', () => {
    const conPantalla = (pantalla: unknown) => validarComentario({ tipo: 'otro', mensaje: 'x', pantalla }).pantalla;

    expect(conPantalla('/metas/abc-123')).toBe('/metas/abc-123');
    expect(conPantalla('https://malo.com/')).toBeNull();
    expect(conPantalla('/a b')).toBeNull();
    expect(conPantalla('/x\nBcc: alguien@malo.com')).toBeNull();
    expect(conPantalla('/' + 'a'.repeat(120))).toBeNull();
    expect(conPantalla(42)).toBeNull();
  });
});

describe('construirCorreoComentario', () => {
  const ahora = new Date('2026-10-08T21:30:00Z');
  const entrada = { tipo: 'problema' as const, mensaje: 'La cifra no cuadra\nme falta un gasto <script>alert(1)</script>', pantalla: '/', responder: false };

  it('va a soporte, con el tipo y el comienzo del mensaje en el asunto (sin saltos de línea)', () => {
    const correo = construirCorreoComentario({ entrada, tenantId: 'tenant-1', correoDeLaPersona: null, ahora });

    expect(correo.para).toBe('soporte@korly.com.mx');
    expect(correo.asunto).toBe('[Korly] Problema: La cifra no cuadra');
    expect(correo.asunto).not.toMatch(/[\r\n]/);
  });

  it('el cuerpo es texto plano con el mensaje tal cual, la pantalla, la cuenta y la fecha en hora de México', () => {
    const correo = construirCorreoComentario({ entrada, tenantId: 'tenant-1', correoDeLaPersona: null, ahora });

    expect(correo.html).toBeUndefined();
    expect(correo.textoPlano).toContain('<script>alert(1)</script>'); // texto, nunca marcado: no se interpreta
    expect(correo.textoPlano).toContain('Pantalla: /');
    expect(correo.textoPlano).toContain('Cuenta: tenant-1');
    expect(correo.textoPlano).toMatch(/Fecha: .*hora de México/);
  });

  it('sin la casilla, NO lleva el correo de la persona ni "responder a", aunque se tenga', () => {
    const correo = construirCorreoComentario({ entrada, tenantId: 'tenant-1', correoDeLaPersona: 'yo@correo.com', ahora });

    expect(correo.responderA).toBeUndefined();
    expect(correo.textoPlano).not.toContain('yo@correo.com');
    expect(correo.textoPlano).toContain('no marcó la casilla');
  });

  it('con la casilla marcada, su correo es el "responder a" y se lo dice a quien lee', () => {
    const correo = construirCorreoComentario({ entrada: { ...entrada, responder: true }, tenantId: 'tenant-1', correoDeLaPersona: 'yo@correo.com', ahora });

    expect(correo.responderA).toBe('yo@correo.com');
    expect(correo.textoPlano).toContain('escríbele a yo@correo.com');
  });

  it('con la casilla marcada pero sin poder saber su correo, lo dice y no pone "responder a"', () => {
    const correo = construirCorreoComentario({ entrada: { ...entrada, responder: true }, tenantId: 'tenant-1', correoDeLaPersona: null, ahora });

    expect(correo.responderA).toBeUndefined();
    expect(correo.textoPlano).toContain('no se pudo obtener su correo');
  });

  it('un mensaje largo se recorta en el asunto, y el destino se puede cambiar con COMENTARIOS_DESTINO', () => {
    vi.stubEnv('COMENTARIOS_DESTINO', 'otro@korly.com.mx');
    const correo = construirCorreoComentario({ entrada: { ...entrada, mensaje: 'x'.repeat(200) }, tenantId: 't', correoDeLaPersona: null, ahora });

    expect(correo.para).toBe('otro@korly.com.mx');
    expect(correo.asunto.length).toBeLessThan(90);
    expect(correo.asunto.endsWith('…')).toBe(true);
  });
});
