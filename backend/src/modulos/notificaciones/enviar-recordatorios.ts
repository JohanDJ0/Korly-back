import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { movimientos } from '../../db/schema/ledger.js';
import { recordatoriosEnviados } from '../../db/schema/recordatorios.js';
import { tenants } from '../../db/schema/tenants.js';
import { consultarDisponible, type DisponibleOk } from '../disponible/consultar-disponible.js';
import { enviarCorreo } from '../../shared/email.js';
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
  if (disponible.gastadoHoyValorMinimo > 0n) {
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
      asunto: `Hoy puedes gastar hasta ${formatearMontoMXN(disponible.cifraDiariaValorMinimo)}`,
      textoPlano: construirTextoRecordatorio(disponible),
    });

    return { tenantId, enviado: true };
  });
}

function construirTextoRecordatorio(disponible: DisponibleOk): string {
  const dias = disponible.diasRestantes === 1 ? '1 día' : `${disponible.diasRestantes} días`;
  return `Te quedan ${dias} con ${formatearMontoMXN(disponible.disponibleValorMinimo)} disponible — hoy puedes gastar hasta ${formatearMontoMXN(disponible.cifraDiariaValorMinimo)}.`;
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
