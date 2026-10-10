import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { movimientos } from '../../db/schema/ledger.js';
import { recordatoriosEnviados } from '../../db/schema/recordatorios.js';
import { tenants } from '../../db/schema/tenants.js';
import { consultarDisponible, type DisponibleOk } from '../disponible/consultar-disponible.js';
import { enviarCorreo } from '../../shared/email.js';
import { CORREO_SOPORTE, escaparHtml } from '../../shared/plantilla-correo.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { dbAdmin } from '../../shared/db-admin.js';
import { fechaISO } from '../../shared/fechas.js';
import { obtenerCorreoTenantTx, resolverCorreoViaSupabase, type ResolverCorreo } from '../../shared/correo-tenant.js';

const MONEDA_DEFAULT = 'MXN';
const VENTANA_ACTIVIDAD_MS = 24 * 60 * 60 * 1000;
const RECORDATORIOS_IGNORADOS_PARA_BACKOFF = 3;
const DIAS_ESPERA_EN_BACKOFF = 3;

function formatearMontoMXN(valorMinimo: bigint): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: MONEDA_DEFAULT }).format(Number(valorMinimo) / 100);
}

/**
 * Único (`gasto` o `ingreso`) dentro de la ventana de 24h después de un
 * recordatorio — es la señal de "el usuario sí reaccionó", usada tanto
 * para la regla 2 (no repetir el día en que ya hubo actividad) como
 * para la 3 (frecuencia decreciente). `aporte_meta`/`retiro_meta` no
 * cuentan a propósito: la pregunta no es "¿tocó algo la cuenta?", es
 * "¿registró un ingreso o un gasto?", que es lo que el recordatorio le
 * pide hacer.
 */
async function huboActividadEnVentanaTx(tx: Ejecutor, tenantId: string, desde: Date): Promise<boolean> {
  const hasta = new Date(desde.getTime() + VENTANA_ACTIVIDAD_MS);
  const [fila] = await tx
    .select({ id: movimientos.id })
    .from(movimientos)
    .where(
      and(
        eq(movimientos.tenantId, tenantId),
        inArray(movimientos.tipo, ['gasto', 'ingreso']),
        gte(movimientos.fechaRegistro, desde),
        lt(movimientos.fechaRegistro, hasta)
      )
    )
    .limit(1);
  return !!fila;
}

/**
 * Regla 3 (obligatoria, documento-maestro-v2.md §13.4): "si el usuario
 * no responde a 3 seguidas, bajar cadencia antes de que las
 * desactive". Sin suficiente historial (menos de 3 recordatorios
 * mandados todavía), nunca hay backoff — no hay nada que "ignorar"
 * repetidamente. Con los 3 últimos ignorados, la cadencia baja a uno
 * cada `DIAS_ESPERA_EN_BACKOFF` días; en cuanto UNO de los últimos 3
 * sí tuvo actividad después, se vuelve a diario sin más trámite (no
 * hace falta una bandera de "salir del backoff": el cálculo se rehace
 * desde cero en cada corrida, viendo otra vez los últimos 3 reales).
 */
async function estaEnBackoffTx(tx: Ejecutor, tenantId: string, fechaReferencia: Date): Promise<boolean> {
  const ultimosEnvios = await tx
    .select({ fecha: recordatoriosEnviados.fecha, creadoEn: recordatoriosEnviados.creadoEn })
    .from(recordatoriosEnviados)
    .where(and(eq(recordatoriosEnviados.tenantId, tenantId), eq(recordatoriosEnviados.tipo, 'diario')))
    .orderBy(desc(recordatoriosEnviados.fecha))
    .limit(RECORDATORIOS_IGNORADOS_PARA_BACKOFF);
  if (ultimosEnvios.length < RECORDATORIOS_IGNORADOS_PARA_BACKOFF) return false;

  for (const envio of ultimosEnvios) {
    if (await huboActividadEnVentanaTx(tx, tenantId, envio.creadoEn)) return false;
  }

  const msPorDia = 24 * 60 * 60 * 1000;
  const diasDesdeUltimoEnvio = Math.floor((fechaReferencia.getTime() - new Date(`${ultimosEnvios[0]!.fecha}T00:00:00Z`).getTime()) / msPorDia);
  return diasDesdeUltimoEnvio < DIAS_ESPERA_EN_BACKOFF;
}

export interface ResultadoRecordatorioDiario {
  tenantId: string;
  enviado: boolean;
  /** Solo para el log del job — nunca se le muestra a nadie. */
  motivo?: 'sin_periodo_activo_o_ingreso' | 'ya_registro_hoy' | 'ya_enviado' | 'en_backoff' | 'sin_correo';
}

/**
 * Línea de resumen del job. Desglosa los omitidos por motivo: un "0
 * enviados" sin ese desglose no distingue "nadie lo necesitaba hoy" de
 * "algo está roto". Solo cuenta — no incluye ids ni correos.
 */
export function resumirCorrida(resultados: ResultadoRecordatorioDiario[], fallidos: number): string {
  const enviados = resultados.filter((resultado) => resultado.enviado).length;
  const omitidos = resultados.filter((resultado) => !resultado.enviado);

  const porMotivo = new Map<string, number>();
  for (const resultado of omitidos) {
    const motivo = resultado.motivo ?? 'desconocido';
    porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1);
  }
  const detalle = [...porMotivo]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([motivo, cantidad]) => `${motivo}: ${cantidad}`)
    .join(', ');

  return `tenants: ${resultados.length + fallidos} — enviados: ${enviados}, omitidos: ${omitidos.length}${detalle ? ` (${detalle})` : ''}, fallidos: ${fallidos}`;
}

/**
 * Todo el trabajo de un tenant para el recordatorio diario, en el
 * orden de las reglas obligatorias: datos completos (regla 5) →
 * silencio si ya hubo actividad (regla 2) → no duplicar → frecuencia
 * decreciente (regla 3) → reclamar el envío de hoy (protege contra que
 * el cron corra dos veces, CLAUDE.md) → mandar con la cifra accionable
 * (regla 1). Nunca lanza por un tenant individual: el llamador
 * (`scripts/enviar-recordatorios.ts`) sigue con el resto aunque uno
 * falle.
 */
export async function procesarRecordatorioDiarioDeTenant(
  tenantId: string,
  fechaReferencia: Date,
  resolverCorreo: ResolverCorreo = resolverCorreoViaSupabase
): Promise<ResultadoRecordatorioDiario> {
  const disponible = await consultarDisponible(tenantId, fechaReferencia);
  if (!disponible || disponible.estado !== 'ok') {
    return { tenantId, enviado: false, motivo: 'sin_periodo_activo_o_ingreso' };
  }
  // `huboActividadHoy`, no `gastadoHoyValorMinimo > 0n` (hallazgo real,
  // mismo caso que RecordatorioContextual.tsx): un retiro de meta que
  // cubre un gasto el mismo día deja gastadoHoy en 0 porque se cancelan
  // entre sí, pero sí hubo actividad real — con el criterio viejo, el
  // recordatorio igual se habría mandado ese día.
  if (disponible.huboActividadHoy) {
    return { tenantId, enviado: false, motivo: 'ya_registro_hoy' };
  }

  const fechaHoy = fechaISO(fechaReferencia);

  return conTenant(tenantId, async (tx) => {
    if (await estaEnBackoffTx(tx, tenantId, fechaReferencia)) {
      return { tenantId, enviado: false, motivo: 'en_backoff' as const };
    }

    // `onConflictDoNothing`, no un SAVEPOINT+reintento (crear-periodo.ts):
    // aquí no queremos reintentar hasta lograrlo, queremos exactamente lo
    // contrario — si otra corrida del cron ya reclamó el día de hoy para
    // este tenant, esta corrida simplemente no manda nada.
    const [reclamado] = await tx
      .insert(recordatoriosEnviados)
      .values({ tenantId, fecha: fechaHoy, tipo: 'diario' })
      .onConflictDoNothing()
      .returning({ id: recordatoriosEnviados.id });
    if (!reclamado) {
      return { tenantId, enviado: false, motivo: 'ya_enviado' as const };
    }

    const correo = await obtenerCorreoTenantTx(tx, tenantId, resolverCorreo);
    if (!correo) {
      return { tenantId, enviado: false, motivo: 'sin_correo' as const };
    }

    await enviarCorreo({
      para: correo,
      responderA: CORREO_SOPORTE,
      ...construirCorreoRecordatorio(disponible, process.env.FRONTEND_URL ?? 'http://localhost:5173'),
    });

    return { tenantId, enviado: true };
  });
}

/** Dirección de la app que abre la hoja de "Nuevo gasto": `https://app…/?gasto=1`. */
export function urlRegistroDeGasto(urlApp: string): string {
  const base = urlApp.replace(/\/+$/, '');
  return base.includes('?') ? `${base}&gasto=1` : `${base}/?gasto=1`;
}

/**
 * Asunto, HTML y texto plano del recordatorio diario. La cifra accionable va
 * en el asunto (regla 1, documento-maestro-v2.md §13.4): lo que se lee en la
 * bandeja sin abrir el correo es "Hoy puedes gastar hasta $X".
 *
 * **Casi texto plano a propósito, sin el molde con marca de `plantilla-correo.ts`.**
 * Con la banda de color y el botón grande, Gmail mandó el recordatorio a la
 * pestaña Promociones (probado contra una cuenta real); el mismo contenido como
 * mensaje sencillo —sin banda, sin botón, un solo enlace escrito en el texto—
 * llegó a Principal, también con la cifra en el asunto. Un recordatorio que
 * nadie ve no sirve (regla 3: el backoff ya cuenta los ignorados). Los correos
 * de autenticación de Supabase sí conservan el diseño: no caen en Promociones.
 * Sin enlace al aviso de privacidad por la misma razón (menos enlaces); el pie
 * dice cómo desactivarlo.
 */
export function construirCorreoRecordatorio(disponible: DisponibleOk, urlApp: string): { asunto: string; html: string; textoPlano: string } {
  const cifraDiaria = formatearMontoMXN(disponible.cifraDiariaValorMinimo);
  const dias = disponible.diasRestantes === 1 ? '1 día' : `${disponible.diasRestantes} días`;

  const quedan = `Te quedan ${dias} de tu quincena con ${formatearMontoMXN(disponible.disponibleValorMinimo)} disponible.`;
  const hoy = `Hoy puedes gastar hasta ${cifraDiaria}.`;
  // `?gasto=1` abre la app directo en "Nuevo gasto" (o, sin sesión, tras iniciarla). Sigue siendo una dirección
  // escrita en el texto, no un botón: ver el comentario de arriba. Si urlApp ya trae parámetros, se respeta.
  const registra = `Cuando gastes algo, regístralo aquí: ${urlRegistroDeGasto(urlApp)}`;
  const pie = 'Recibes este recordatorio porque lo activaste en Korly. Puedes desactivarlo en Ajustes.';

  const textoPlano = ['Hola,', '', quedan, '', hoy, '', registra, '', '—', pie, `¿Dudas? Responde a este correo o escribe a ${CORREO_SOPORTE}.`].join('\n');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222;max-width:520px">
<p>Hola,</p>
<p>${escaparHtml(quedan)}</p>
<p><strong>${escaparHtml(hoy)}</strong></p>
<p>${escaparHtml(registra)}</p>
<p style="color:#666;font-size:13px">${escaparHtml(pie)}<br>¿Dudas? Responde a este correo.</p>
</div>`;

  return { asunto: `Hoy puedes gastar hasta ${cifraDiaria}`, html, textoPlano };
}

/**
 * Usa `dbAdmin` (rol `postgres`, ver shared/db-admin.ts) a propósito —
 * es la única función de todo el módulo que necesita ver los tenants
 * de todos, en vez de uno ya conocido de antemano.
 */
export async function listarTenantIdsConRecordatoriosActivos(): Promise<string[]> {
  const filas = await dbAdmin.select({ id: tenants.id }).from(tenants).where(eq(tenants.recibirRecordatorios, true));
  return filas.map((fila) => fila.id);
}
