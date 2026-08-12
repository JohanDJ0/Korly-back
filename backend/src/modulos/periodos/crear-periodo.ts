import { and, eq } from 'drizzle-orm';
import { crearCuentaTx } from '../ledger/registrar-movimiento.js';
import { resolverPendientesTx } from '../cierre/cerrar-periodo.js';
import { periodos, type EstadoPeriodo, type TipoPeriodoSoportado } from '../../db/schema/periodos.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
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
    throw new Error(`Tipo de periodo no soportado todavía: ${tipo}`);
  }

  const { fechaInicio, fechaFin } = calcularQuincenaDeCalendario(fechaReferencia);

  return conTenant(tenantId, async (tx) => {
    const cuenta = await crearCuentaTx(tx, tenantId, 'periodo');
    const hayActivo = (await obtenerPeriodoActivoTx(tx, tenantId, fechaReferencia)) !== null;
    const estadoDeseado: EstadoPeriodo = hayActivo ? 'borrador' : 'activo';
    const valoresBase = { tenantId, cuentaId: cuenta.id, tipo, fechaInicio, fechaFin };

    if (estadoDeseado === 'borrador') {
      return insertarPeriodo(tx, { ...valoresBase, estado: 'borrador' });
    }

    try {
      // SAVEPOINT: si el índice único parcial rechaza este insert por una
      // carrera, hace rollback solo hasta aquí — la cuenta creada arriba,
      // en la transacción exterior, sobrevive.
      return await tx.transaction((tx2) => insertarPeriodo(tx2, { ...valoresBase, estado: 'activo' }));
    } catch (error) {
      if (esViolacionDeIndiceUnico(error)) {
        return insertarPeriodo(tx, { ...valoresBase, estado: 'borrador' });
      }
      throw error;
    }
  });
}

export async function obtenerPeriodoActivo(tenantId: string, fechaReferencia: Date = new Date()): Promise<Periodo | null> {
  return conTenant(tenantId, (tx) => obtenerPeriodoActivoTx(tx, tenantId, fechaReferencia));
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
async function obtenerPeriodoActivoTx(tx: Ejecutor, tenantId: string, fechaReferencia: Date): Promise<Periodo | null> {
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

function esViolacionDeIndiceUnico(error: unknown): boolean {
  const codigo = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return codigo === '23505';
}
