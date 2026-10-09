import { conTenant } from '../../shared/db.js';
import { obtenerCorreoTenantTx, resolverCorreoViaSupabase, type ResolverCorreo } from '../../shared/correo-tenant.js';
import { correoDisponible, enviarCorreo, type CorreoEntrada } from '../../shared/email.js';
import { ErrorDominio } from '../../shared/errores.js';
import { CORREO_SOPORTE } from '../../shared/plantilla-correo.js';

/**
 * Comentarios de las personas que usan Korly (botón "Enviar comentarios" de Ajustes). No se guardan en la base de datos:
 * llegan por correo a soporte (`COMENTARIOS_DESTINO`, por omisión `soporte@korly.com.mx`) y ahí viven. Decisión del
 * responsable (2026-10-08): sin tabla ni migración, un dato menos que cuidar.
 *
 * Qué viaja en el correo: el texto, el tipo, la pantalla donde estaba la persona (solo la ruta, p. ej. `/historial`), el
 * identificador de su cuenta (para poder ayudarle) y la fecha. El CORREO de la persona solo va si marca la casilla de que
 * se le pueda responder: entonces se pone como "responder a" del mensaje. Nunca se manda ningún monto ni dato financiero.
 * Todo esto está dicho en el aviso de privacidad.
 */

export const TIPOS_DE_COMENTARIO = ['problema', 'idea', 'otro'] as const;
export type TipoDeComentario = (typeof TIPOS_DE_COMENTARIO)[number];

export const LONGITUD_MAXIMA_MENSAJE = 2000;

const ETIQUETAS: Record<TipoDeComentario, string> = { problema: 'Problema', idea: 'Idea', otro: 'Comentario' };
/** Solo rutas de la propia app (`/historial`, `/metas/…`): cualquier otra cosa se descarta, nunca se pega tal cual en un correo. */
const RUTA_VALIDA = /^\/[A-Za-z0-9\-_/]{0,98}$/;

export interface ComentarioEntrada {
  tipo: TipoDeComentario;
  mensaje: string;
  pantalla: string | null;
  responder: boolean;
}

export function validarComentario(body: unknown): ComentarioEntrada {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorDominio('VALIDACION', 'El comentario debe enviarse como un objeto JSON');
  }
  const { tipo, mensaje, pantalla, responder } = body as Record<string, unknown>;

  if (typeof tipo !== 'string' || !(TIPOS_DE_COMENTARIO as readonly string[]).includes(tipo)) {
    throw new ErrorDominio('VALIDACION', `El campo 'tipo' debe ser uno de: ${TIPOS_DE_COMENTARIO.join(', ')}`);
  }
  if (typeof mensaje !== 'string' || mensaje.trim().length === 0) {
    throw new ErrorDominio('VALIDACION', 'Escribe tu comentario');
  }
  const texto = mensaje.trim();
  if (texto.length > LONGITUD_MAXIMA_MENSAJE) {
    throw new ErrorDominio('VALIDACION', `El comentario no puede pasar de ${LONGITUD_MAXIMA_MENSAJE} caracteres`);
  }
  if (responder !== undefined && typeof responder !== 'boolean') {
    throw new ErrorDominio('VALIDACION', "El campo 'responder' debe ser booleano");
  }

  return {
    tipo: tipo as TipoDeComentario,
    mensaje: texto,
    pantalla: typeof pantalla === 'string' && RUTA_VALIDA.test(pantalla) ? pantalla : null,
    responder: responder === true,
  };
}

/** Primera línea del mensaje, recortada y sin saltos de línea (va en el asunto: un salto ahí sería inyección de encabezados). */
function resumenParaAsunto(mensaje: string): string {
  const linea = (mensaje.split(/\r?\n/)[0] ?? '').replace(/\s+/g, ' ').trim();
  return linea.length > 60 ? `${linea.slice(0, 57)}…` : linea;
}

export interface DatosDelCorreo {
  entrada: ComentarioEntrada;
  tenantId: string;
  /** Solo si la persona pidió respuesta y se pudo averiguar. */
  correoDeLaPersona: string | null;
  ahora: Date;
}

/** Texto plano a propósito (sin HTML): lo que escribe la gente nunca se interpreta como marcado. */
export function construirCorreoComentario({ entrada, tenantId, correoDeLaPersona, ahora }: DatosDelCorreo): CorreoEntrada {
  const fecha = ahora.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' });
  const responder = entrada.responder
    ? correoDeLaPersona
      ? `sí, escríbele a ${correoDeLaPersona} (basta con responder este correo)`
      : 'sí, pero no se pudo obtener su correo'
    : 'no marcó la casilla de que le respondamos';

  return {
    para: process.env.COMENTARIOS_DESTINO || CORREO_SOPORTE,
    asunto: `[Korly] ${ETIQUETAS[entrada.tipo]}: ${resumenParaAsunto(entrada.mensaje)}`,
    textoPlano: [
      entrada.mensaje,
      '',
      '—',
      `Tipo: ${ETIQUETAS[entrada.tipo]}`,
      `Pantalla: ${entrada.pantalla ?? 'no indicada'}`,
      `Cuenta: ${tenantId}`,
      `Fecha: ${fecha} (hora de México)`,
      `¿Responder?: ${responder}`,
    ].join('\n'),
    ...(entrada.responder && correoDeLaPersona ? { responderA: correoDeLaPersona } : {}),
  };
}

export interface DependenciasComentario {
  enviar?: (correo: CorreoEntrada) => Promise<void>;
  resolverCorreo?: ResolverCorreo;
  ahora?: Date;
}

/** Manda el comentario a soporte. Sin proveedor de correo configurado falla con `COMENTARIOS_NO_DISPONIBLES` (no aparenta enviar). */
export async function enviarComentario(tenantId: string, entrada: ComentarioEntrada, dependencias: DependenciasComentario = {}): Promise<void> {
  const enviar = dependencias.enviar ?? enviarCorreo;
  if (!dependencias.enviar && !correoDisponible()) {
    throw new ErrorDominio('COMENTARIOS_NO_DISPONIBLES', 'Ahora mismo no podemos recibir comentarios. Escríbenos a ' + CORREO_SOPORTE);
  }

  const correoDeLaPersona = entrada.responder
    ? await conTenant(tenantId, (tx) => obtenerCorreoTenantTx(tx, tenantId, dependencias.resolverCorreo ?? resolverCorreoViaSupabase)).catch(() => null)
    : null;

  await enviar(construirCorreoComentario({ entrada, tenantId, correoDeLaPersona, ahora: dependencias.ahora ?? new Date() }));
}
