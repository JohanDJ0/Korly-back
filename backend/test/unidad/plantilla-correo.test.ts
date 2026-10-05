import { describe, expect, it } from 'vitest';
import { construirCorreoRecordatorio } from '../../src/modulos/notificaciones/enviar-recordatorios.js';
import { PLANTILLAS } from '../../src/shared/plantillas-supabase.js';
import { CORREO_SOPORTE, renderizarCorreo } from '../../src/shared/plantilla-correo.js';

const base = { preencabezado: 'vista previa', titulo: 'Título', parrafos: ['Hola'] };
const opciones = { urlApp: 'https://app.korly.com.mx' };

describe('renderizarCorreo', () => {
  it('escapa todo lo que entra: un dato de usuario con HTML no se inyecta en el correo', () => {
    const { html } = renderizarCorreo({ ...base, parrafos: ['<script>alert(1)</script> & "x"'], titulo: '<b>Hola</b>' }, opciones);

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Hola</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
  });

  it('una URL con comillas no puede salirse del atributo href', () => {
    const { html } = renderizarCorreo({ ...base, boton: { texto: 'Ir', url: 'https://x.com/"onmouseover="alert(1)' } }, opciones);

    expect(html).not.toContain('href="https://x.com/"onmouseover');
    expect(html).toContain('&quot;onmouseover=&quot;');
  });

  it('el botón aparece en HTML y su URL también en el texto plano, que es la alternativa', () => {
    const { html, textoPlano } = renderizarCorreo({ ...base, boton: { texto: 'Confirmar', url: 'https://app.korly.com.mx/a?b=1&c=2' } }, opciones);

    expect(html).toContain('>Confirmar</a>');
    expect(html).toContain('https://app.korly.com.mx/a?b=1&amp;c=2');
    expect(textoPlano).toContain('Confirmar: https://app.korly.com.mx/a?b=1&c=2');
  });

  it('solo el botón: no repite la URL como texto ni pide copiar y pegar el enlace', () => {
    const { html, textoPlano } = renderizarCorreo({ ...base, boton: { texto: 'Ir', url: 'https://app.korly.com.mx/x' } }, opciones);

    expect(html).not.toMatch(/copia y pega|botón no funciona/i);
    expect(html.split('https://app.korly.com.mx/x')).toHaveLength(2); // aparece una sola vez: el href del botón
    expect(textoPlano).not.toMatch(/copia y pega|botón no funciona/i);
  });

  it('lleva el texto de vista previa oculto, el soporte y el aviso de privacidad', () => {
    const { html, textoPlano } = renderizarCorreo({ ...base, preencabezado: 'Resumen del día' }, { urlApp: 'https://app.korly.com.mx/' });

    expect(html).toContain('display:none');
    expect(html).toContain('Resumen del día');
    expect(html).toContain(`mailto:${CORREO_SOPORTE}`);
    expect(html).toContain('https://app.korly.com.mx/privacidad'); // sin barra doble aunque urlApp termine en /
    expect(textoPlano).toContain('Aviso de privacidad: https://app.korly.com.mx/privacidad');
  });

  it('sin cifra ni botón no deja bloques vacíos', () => {
    const { html } = renderizarCorreo(base, opciones);

    expect(html).not.toContain('text-transform:uppercase');
    expect(html).not.toContain('border-radius:10px');
  });
});

describe('construirCorreoRecordatorio', () => {
  const disponible = { diasRestantes: 13, disponibleValorMinimo: 541605n, cifraDiariaValorMinimo: 33174n } as never;

  it('la cifra accionable va en el asunto y destacada en el cuerpo, con el monto en pesos mexicanos', () => {
    const { asunto, html, textoPlano } = construirCorreoRecordatorio(disponible, 'https://app.korly.com.mx');

    expect(asunto).toBe('Hoy puedes gastar hasta $331.74');
    expect(html).toContain('<strong>Hoy puedes gastar hasta $331.74.</strong>');
    expect(textoPlano).toContain('Hoy puedes gastar hasta $331.74.');
    expect(textoPlano).toContain('13 días');
  });

  it('con 1 día restante lo dice en singular', () => {
    const { textoPlano } = construirCorreoRecordatorio({ ...(disponible as object), diasRestantes: 1 } as never, 'https://app.korly.com.mx');

    expect(textoPlano).toContain('1 día de tu quincena');
    expect(textoPlano).not.toContain('1 días');
  });

  it('es un mensaje sencillo: la dirección de la app va escrita en el texto, sin botón ni banda con diseño (Gmail lo mandaba a Promociones)', () => {
    const { html, textoPlano } = construirCorreoRecordatorio(disponible, 'https://app.korly.com.mx');

    expect(html).toContain('regístralo en https://app.korly.com.mx');
    expect(textoPlano).toContain('regístralo en https://app.korly.com.mx');
    expect(html).not.toMatch(/<a |<table|border-radius|background:/);
  });

  it('dice cómo desactivar los recordatorios y a dónde escribir', () => {
    const { textoPlano } = construirCorreoRecordatorio(disponible, 'https://app.korly.com.mx');

    expect(textoPlano).toContain('Puedes desactivarlo en Ajustes');
    expect(textoPlano).toContain(CORREO_SOPORTE);
  });

  it('escapa lo que se interpola en el HTML', () => {
    const { html } = construirCorreoRecordatorio(disponible, 'https://app.korly.com.mx/?a=1&b=<x>');

    expect(html).toContain('a=1&amp;b=&lt;x&gt;');
    expect(html).not.toContain('<x>');
  });
});

describe('plantillas de Supabase', () => {
  it('son las 6 que usa Supabase, cada una con asunto y archivo propios', () => {
    expect(PLANTILLAS.map((p) => p.nombreEnSupabase).sort()).toEqual(['Change email address', 'Confirm sign up', 'Invite user', 'Magic link', 'Reauthentication', 'Reset password']);
    expect(new Set(PLANTILLAS.map((p) => p.archivo)).size).toBe(6);
    expect(PLANTILLAS.every((p) => p.asunto.length > 0)).toBe(true);
  });

  it('conservan las variables de Supabase sin escapar, para que las sustituya al enviar', () => {
    for (const plantilla of PLANTILLAS) {
      const { html } = renderizarCorreo(plantilla.contenido, { urlApp: '{{ .SiteURL }}' });
      const esperadas = ['{{ .ConfirmationURL }}', '{{ .Token }}'].filter((v) => JSON.stringify(plantilla.contenido).includes(v));

      expect(esperadas.length).toBeGreaterThan(0);
      for (const variable of esperadas) expect(html).toContain(variable);
      expect(html).toContain('{{ .SiteURL }}/privacidad');
    }
  });

  it('el correo del código de verificación no lleva botón: el código se teclea, no se pulsa', () => {
    const codigo = PLANTILLAS.find((p) => p.archivo === 'codigo-de-verificacion')!;

    expect(codigo.contenido.boton).toBeUndefined();
    expect(codigo.contenido.cifra?.valor).toBe('{{ .Token }}');
  });
});
