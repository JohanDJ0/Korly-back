import { and, eq } from 'drizzle-orm';
import { crearCuentaTx } from '../ledger/registrar-movimiento.js';
import { periodos, type EstadoPeriodo, type TipoPeriodoSoportado } from '../../db/schema/periodos.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { calcularQuincenaDeCalendario } from './calcular-quincena.js';

export interface Periodo {
  id: string;
  estado: EstadoPeriodo;
  fechaInicio: string;
  fechaFin: string;
}

const COLUMNAS_PERIODO = {
  id: periodos.id,
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
    const hayActivo = (await obtenerPeriodoActivoTx(tx, tenantId)) !== null;
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

export async function obtenerPeriodoActivo(tenantId: string): Promise<Periodo | null> {
  return conTenant(tenantId, (tx) => obtenerPeriodoActivoTx(tx, tenantId));
}

async function obtenerPeriodoActivoTx(tx: Ejecutor, tenantId: string): Promise<Periodo | null> {
  const [fila] = await tx
    .select(COLUMNAS_PERIODO)
    .from(periodos)
    .where(and(eq(periodos.tenantId, tenantId), eq(periodos.estado, 'activo')))
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
