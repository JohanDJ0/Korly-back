import { and, asc, desc, eq } from 'drizzle-orm';
import { crearCuentaTx } from '../ledger/registrar-movimiento.js';
import { resolverPendientesTx } from '../cierre/cerrar-periodo.js';
import { reclamarArrastresTx } from '../cierre/materializar-arrastre.js';
import { asientos, cuentas } from '../../db/schema/ledger.js';
import { periodos, type EstadoPeriodo, type TipoPeriodoSoportado } from '../../db/schema/periodos.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio, esViolacionDeIndiceUnico } from '../../shared/errores.js';
import { calcularQuincenaDeCalendario } from './calcular-quincena.js';

export interface Periodo {
  id: string;
  cuentaId: string;
  estado: EstadoPeriodo;
  fechaInicio: string;
  fechaFin: string;
}

const COLUMNAS_PERIODO = {
  id: periodos.id,
  cuentaId: periodos.cuentaId,
  estado: periodos.estado,
  fechaInicio: periodos.fechaInicio,
  fechaFin: periodos.fechaFin,
} as const;

/**
 * Crea un periodo y su cuenta de ledger en una sola transacción atómica
 * (invariante 6-10, modelo-dominio.md). El rango de fechas se deriva del
 * anclaje a calendario, nunca se recibe del caller (ADR-004).
 *
 * Invariante 9 ("solo un periodo activo por tenant"): si ya hay uno
 * activo, este se crea en 'borrador' — no es un error, es el
 * comportamiento documentado (modelo-dominio.md §3, "casos límite").
 *
 * **Higiene de borradores (ver README, "Qué falta"):** a diferencia de
 * `'activo'`, no hay un índice único que impida varios `'borrador'` por
 * tenant — así que, antes de crear uno nuevo, esta función busca si ya
 * existe uno y compara su ventana con la de hoy (`calcularQuincenaDeCalendario`
 * es determinista sobre la fecha real, no sobre cuántas veces se llamó):
 *
 * - Si representa exactamente la misma quincena que se está por crear,
 *   se devuelve tal cual (idempotente, mismo criterio que
 *   `cerrarPeriodoManualmente` con un periodo ya cerrado). Esto es lo
 *   normal cuando ya hay un activo bloqueando: como ambos se calculan
 *   sobre la fecha real en que se crearon y el activo sigue vigente
 *   (si no, ya se habría cerrado), comparten la misma ventana.
 * - Si representa una quincena distinta, quedó huérfano — su ventana
 *   pasó sin que `promoverBorradorSiExisteTx` (cerrar-periodo.ts) lo
 *   ascendiera a `'activo'` a tiempo — y se elimina: único hard delete
 *   de todo el sistema, justificado porque un borrador nunca puede
 *   tener actividad financiera (invariante 10: un gasto o ingreso solo
 *   se registra contra un periodo `'activo'`). Nótese que esto NO
 *   depende de si hay un activo ahora mismo: un borrador huérfano y un
 *   activo bloqueante no pueden coexistir (comparten `fechaFin`, así
 *   que si uno venció el otro también), así que este caso solo se ve
 *   cuando `hayActivo` ya es `false`.
 *
 * La comprobación de "¿hay uno activo?" y el INSERT no son atómicos por
 * sí solos: dos requests de "crear periodo" casi simultáneas podrían
 * ver ambas "no hay activo" y competir por serlo. El índice único
 * parcial en el schema es la autoridad real; si el INSERT como 'activo'
 * choca con él, se reintenta como 'borrador' dentro de un SAVEPOINT, sin
 * perder la cuenta ya creada en la transacción exterior.
 */
export async function crearPeriodo(
  tenantId: string,
  tipo: TipoPeriodoSoportado,
  fechaReferencia: Date = new Date()
): Promise<Periodo> {
  if (tipo !== 'quincenal') {
    throw new ErrorDominio('VALIDACION', `Tipo de periodo no soportado todavía: ${tipo}`);
  }

  const { fechaInicio, fechaFin } = calcularQuincenaDeCalendario(fechaReferencia);

  return conTenant(tenantId, async (tx) => {
    const hayActivo = (await obtenerPeriodoActivoTx(tx, tenantId, fechaReferencia)) !== null;

    const borradorExistente = await obtenerBorradorTx(tx, tenantId);
    if (borradorExistente) {
      const representaHoy = borradorExistente.fechaInicio === fechaInicio && borradorExistente.fechaFin === fechaFin;
      if (representaHoy) return borradorExistente;
      await eliminarBorradorHuerfanoTx(tx, tenantId, borradorExistente);
    }

    const cuenta = await crearCuentaTx(tx, tenantId, 'periodo');
    const valoresBase = { tenantId, cuentaId: cuenta.id, tipo, fechaInicio, fechaFin };

    if (hayActivo) {
      // Un periodo en borrador no es "el periodo siguiente" todavía —
      // no reclama arrastres pendientes. Los reclama el que sí llegue a
      // activo (hoy no hay mecanismo que promueva un borrador a activo
      // cuando el bloqueante cierra; ver README, "Qué falta").
      return insertarPeriodo(tx, { ...valoresBase, estado: 'borrador' });
    }

    let periodoCreado: Periodo;
    try {
      // SAVEPOINT: si el índice único parcial rechaza este insert por una
      // carrera, hace rollback solo hasta aquí — la cuenta creada arriba,
      // en la transacción exterior, sobrevive.
      periodoCreado = await tx.transaction((tx2) => insertarPeriodo(tx2, { ...valoresBase, estado: 'activo' }));
    } catch (error) {
      if (esViolacionDeIndiceUnico(error)) {
        return insertarPeriodo(tx, { ...valoresBase, estado: 'borrador' });
      }
      throw error;
    }

    // Fuera del try/catch de arriba a propósito: si esto falla, no debe
    // interpretarse como "perdí la carrera del periodo activo" y caer a
    // borrador — el periodo ya se creó como activo. Un error aquí debe
    // abortar toda la operación (se revierte junto con todo lo demás).
    await reclamarArrastresTx(tx, tenantId, periodoCreado.id, periodoCreado.cuentaId, fechaReferencia);

    return periodoCreado;
  });
}

export async function obtenerPeriodoActivo(tenantId: string, fechaReferencia: Date = new Date()): Promise<Periodo | null> {
  return conTenant(tenantId, (tx) => obtenerPeriodoActivoTx(tx, tenantId, fechaReferencia));
}

/**
 * Extensión sobre openapi.yaml (que solo define `POST /periodos` y
 * `GET /periodos/activo`, nunca un listado) — agregada para que el
 * historial pueda enlazar a periodos ya cerrados: `GET /periodos/:id/
 * {resumen,ingresos,gastos}` ya aceptan cualquier `periodoId`, lo único
 * que faltaba era una forma de saber cuáles existen.
 *
 * Devuelve todos los estados (incluido `'borrador'`) — filtrar cuáles
 * mostrar como "periodos anteriores" es una decisión de presentación
 * del cliente, no algo que este endpoint deba imponer. Mismo cierre
 * perezoso que el resto: si el periodo que iba a salir como `'activo'`
 * ya venció, esta llamada lo cierra primero.
 */
export async function listarPeriodos(tenantId: string, fechaReferencia: Date = new Date()): Promise<Periodo[]> {
  return conTenant(tenantId, async (tx) => {
    await resolverPendientesTx(tx, tenantId, fechaReferencia);

    // Desempate por `creadoEn`: dos periodos pueden compartir la misma
    // `fechaInicio` (un borrador creado el mismo día que el activo, misma
    // quincena de calendario) — sin un segundo criterio, el orden entre
    // ellos queda a discreción de Postgres, no del más reciente primero.
    const filas = await tx
      .select(COLUMNAS_PERIODO)
      .from(periodos)
      .where(eq(periodos.tenantId, tenantId))
      .orderBy(desc(periodos.fechaInicio), desc(periodos.creadoEn));

    return filas.map((fila) => ({ ...fila, estado: fila.estado as EstadoPeriodo }));
  });
}

/**
 * Cierre perezoso (ADR-004): antes de decidir cuál periodo está activo,
 * se resuelve lo pendiente para este tenant — si el que iba a devolver
 * ya pasó su `fechaFin`, se cierra aquí mismo y deja de contar como
 * activo. Es el único punto de entrada para esto: todo lo que llama a
 * `obtenerPeriodoActivo`/`obtenerPeriodoPorId` (disponible, ingresos,
 * gastos, este mismo módulo) lo hereda gratis, sin tener que acordarse
 * de llamarlo por separado. Esto es lo que vuelve redundante — en el
 * camino normal, no como mecanismo principal — el tope de "mínimo 1 día"
 * en modulos/disponible/motor-flujo-caja.ts.
 */
export async function obtenerPeriodoActivoTx(tx: Ejecutor, tenantId: string, fechaReferencia: Date): Promise<Periodo | null> {
  await resolverPendientesTx(tx, tenantId, fechaReferencia);

  const [fila] = await tx
    .select(COLUMNAS_PERIODO)
    .from(periodos)
    .where(and(eq(periodos.tenantId, tenantId), eq(periodos.estado, 'activo')))
    .limit(1);

  return fila ? { ...fila, estado: fila.estado as EstadoPeriodo } : null;
}

export async function obtenerPeriodoPorId(tenantId: string, periodoId: string, fechaReferencia: Date = new Date()): Promise<Periodo | null> {
  return conTenant(tenantId, (tx) => obtenerPeriodoPorIdTx(tx, tenantId, periodoId, fechaReferencia));
}

/**
 * `tenantId` en el `WHERE` es cinturón y tirantes, no la defensa real:
 * la política RLS de `periodos` ya filtra por `app.tenant_id` de la
 * transacción, así que pedir el periodo de otro tenant por id devuelve
 * `null` (RLS oculta la fila) en vez de exponer que existe en otro
 * estado — es la defensa en profundidad que promete ADR-005 funcionando
 * en este caso concreto: un intento de BOLA vía `periodoId` no distingue
 * "no existe" de "existe pero no es tuyo".
 *
 * Mismo cierre perezoso que `obtenerPeriodoActivoTx` — un `periodoId`
 * que apunta al periodo activo vencido debe reflejar que ya está
 * cerrado, no dejar que ingresos/gastos escriban contra un periodo que
 * en la realidad ya terminó.
 */
export async function obtenerPeriodoPorIdTx(tx: Ejecutor, tenantId: string, periodoId: string, fechaReferencia: Date = new Date()): Promise<Periodo | null> {
  await resolverPendientesTx(tx, tenantId, fechaReferencia);

  const [fila] = await tx
    .select(COLUMNAS_PERIODO)
    .from(periodos)
    .where(and(eq(periodos.tenantId, tenantId), eq(periodos.id, periodoId)))
    .limit(1);

  return fila ? { ...fila, estado: fila.estado as EstadoPeriodo } : null;
}

/**
 * El borrador más antiguo si hay varios (mismo criterio de desempate
 * que `promoverBorradorSiExisteTx`, modulos/cierre/cerrar-periodo.ts) —
 * en el camino normal nunca debería haber más de uno, pero si datos de
 * antes de este arreglo dejaron varios, no es ambiguo cuál se reutiliza.
 */
async function obtenerBorradorTx(tx: Ejecutor, tenantId: string): Promise<Periodo | null> {
  const [fila] = await tx
    .select(COLUMNAS_PERIODO)
    .from(periodos)
    .where(and(eq(periodos.tenantId, tenantId), eq(periodos.estado, 'borrador')))
    .orderBy(asc(periodos.fechaInicio), asc(periodos.creadoEn))
    .limit(1);

  return fila ? { ...fila, estado: fila.estado as EstadoPeriodo } : null;
}

/**
 * Único hard delete de todo el sistema — ver el comentario de
 * `crearPeriodo` sobre por qué es seguro. La comprobación de "cero
 * asientos" no es decorativa: si por algún motivo no previsto un
 * borrador sí tuviera actividad, esto aborta en vez de borrar datos
 * financieros por error.
 */
async function eliminarBorradorHuerfanoTx(tx: Ejecutor, tenantId: string, borrador: Periodo): Promise<void> {
  const [asiento] = await tx.select({ id: asientos.id }).from(asientos).where(eq(asientos.cuentaId, borrador.cuentaId)).limit(1);
  if (asiento) {
    throw new Error(`El borrador ${borrador.id} tiene asientos registrados — no se puede eliminar como huérfano`);
  }

  await tx.delete(periodos).where(and(eq(periodos.tenantId, tenantId), eq(periodos.id, borrador.id)));
  await tx.delete(cuentas).where(and(eq(cuentas.tenantId, tenantId), eq(cuentas.id, borrador.cuentaId)));
}

async function insertarPeriodo(
  tx: Ejecutor,
  valores: {
    tenantId: string;
    cuentaId: string;
    tipo: TipoPeriodoSoportado;
    estado: EstadoPeriodo;
    fechaInicio: string;
    fechaFin: string;
  }
): Promise<Periodo> {
  const [periodo] = await tx.insert(periodos).values(valores).returning(COLUMNAS_PERIODO);
  if (!periodo) throw new Error('No se pudo crear el periodo');
  return { ...periodo, estado: periodo.estado as EstadoPeriodo };
}
