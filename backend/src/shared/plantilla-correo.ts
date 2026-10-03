/**
 * Molde único de los correos de Korly (recordatorios de la app y plantillas
 * de autenticación de Supabase). HTML con tablas y estilos en línea: es lo
 * único que Gmail, Outlook y Apple Mail renderizan igual. Sin imágenes ni
 * fuentes web a propósito — el logo en SVG no se ve en Gmail y las fuentes
 * propias no cargan, así que la marca va como texto con sus colores.
 *
 * Todo lo que entra se escapa: el contenido puede incluir datos de usuario.
 * Las plantillas de Supabase pasan variables Go (`{{ .ConfirmationURL }}`),
 * que no contienen caracteres especiales de HTML y salen intactas.
 */

const VERDE = '#167f6c';
const VERDE_OSCURO = '#146155';
const DORADO = '#feb816';
const CREMA = '#f6f4ef';
const ACENTO = '#eaf5f1';
const BORDE = '#d7e8e3';
const TEXTO = '#1a2321';
const TEXTO_SUAVE = '#5b6b67';
const FUENTE = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const CORREO_SOPORTE = 'soporte@korly.com.mx';

export interface ContenidoCorreo {
  /** Texto de vista previa en la bandeja de entrada (lo que se ve junto al asunto). */
  preencabezado: string;
  titulo: string;
  parrafos: string[];
  /** Bloque destacado con una cifra grande (p. ej. lo que se puede gastar hoy). */
  cifra?: { etiqueta: string; valor: string };
  boton?: { texto: string; url: string };
  /** Texto pequeño bajo el botón (p. ej. "El enlace caduca en 1 hora"). */
  notaBoton?: string;
  /** Repite la URL del botón como texto, para clientes que bloquean enlaces. Por defecto sí; no hace falta si el botón solo abre la app. */
  enlaceAlterno?: boolean;
  /** Líneas pequeñas del pie, además del aviso de privacidad y el soporte. */
  pie?: string[];
}

export interface OpcionesCorreo {
  /** Origen de la app, para el enlace al aviso de privacidad. */
  urlApp: string;
}

function esc(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function renderizarCorreo(contenido: ContenidoCorreo, { urlApp }: OpcionesCorreo): { html: string; textoPlano: string } {
  const urlPrivacidad = `${urlApp.replace(/\/$/, '')}/privacidad`;

  const parrafos = contenido.parrafos
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${TEXTO};">${esc(p)}</p>`)
    .join('');

  const cifra = contenido.cifra
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="background:${ACENTO};border:1px solid ${BORDE};border-radius:12px;padding:20px 24px;">
        <div style="font-size:13px;line-height:18px;color:${TEXTO_SUAVE};letter-spacing:0.04em;text-transform:uppercase;">${esc(contenido.cifra.etiqueta)}</div>
        <div style="font-size:38px;line-height:46px;font-weight:800;color:${VERDE_OSCURO};">${esc(contenido.cifra.valor)}</div>
      </td></tr></table>`
    : '';

  const boton = contenido.boton
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr><td style="background:${VERDE};border-radius:10px;">
        <a href="${esc(contenido.boton.url)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(contenido.boton.texto)}</a>
      </td></tr></table>`
    : '';

  const notaBoton = contenido.notaBoton ? `<p style="margin:8px 0 0;font-size:13px;line-height:20px;color:${TEXTO_SUAVE};">${esc(contenido.notaBoton)}</p>` : '';

  // Si el botón no se puede pulsar (cliente que bloquea enlaces), el texto lleva la URL completa.
  const enlaceAlterno = contenido.boton && contenido.enlaceAlterno !== false
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:20px;color:${TEXTO_SUAVE};">Si el botón no funciona, copia y pega este enlace en tu navegador:<br /><a href="${esc(contenido.boton.url)}" style="color:${VERDE};word-break:break-all;">${esc(contenido.boton.url)}</a></p>`
    : '';

  const lineasPie = (contenido.pie ?? []).map((l) => `<p style="margin:0 0 6px;">${esc(l)}</p>`).join('');

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${esc(contenido.titulo)}</title>
</head>
<body style="margin:0;padding:0;background:${CREMA};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(contenido.preencabezado)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREMA};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FUENTE};">
    <tr><td style="background:${VERDE_OSCURO};border-radius:16px 16px 0 0;padding:24px 32px;border-bottom:4px solid ${DORADO};">
      <span style="font-size:26px;line-height:30px;font-weight:800;color:#ffffff;letter-spacing:-0.01em;">Korly</span>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${BORDE};border-top:0;border-radius:0 0 16px 16px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:24px;line-height:32px;font-weight:800;color:${VERDE_OSCURO};">${esc(contenido.titulo)}</h1>
      ${parrafos}
      ${cifra}
      ${boton}
      ${notaBoton}
      ${enlaceAlterno}
    </td></tr>
    <tr><td style="padding:20px 8px 0;font-size:12px;line-height:18px;color:${TEXTO_SUAVE};">
      ${lineasPie}
      <p style="margin:0 0 6px;">¿Dudas? Escríbenos a <a href="mailto:${CORREO_SOPORTE}" style="color:${VERDE};">${CORREO_SOPORTE}</a>.</p>
      <p style="margin:0;"><a href="${esc(urlPrivacidad)}" style="color:${TEXTO_SUAVE};">Aviso de privacidad</a></p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const textoPlano = [
    contenido.titulo,
    '',
    ...contenido.parrafos.flatMap((p) => [p, '']),
    ...(contenido.cifra ? [`${contenido.cifra.etiqueta}: ${contenido.cifra.valor}`, ''] : []),
    ...(contenido.boton ? [`${contenido.boton.texto}: ${contenido.boton.url}`, ''] : []),
    ...(contenido.notaBoton ? [contenido.notaBoton, ''] : []),
    '—',
    ...(contenido.pie ?? []),
    `¿Dudas? Escríbenos a ${CORREO_SOPORTE}.`,
    `Aviso de privacidad: ${urlPrivacidad}`,
  ].join('\n');

  return { html, textoPlano };
}
