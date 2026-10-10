import { and, asc, eq, sql } from 'drizzle-orm';
import { atajosGasto } from '../../db/schema/atajos-gasto.js';
import { obtenerCategoriaPorIdTx } from '../categorias/categorias.js';
import { cobrosHabilitados, obtenerPlanTenantTx } from '../planes/planes.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio, esViolacionDeIndiceUnico } from '../../shared/errores.js';
import { esUuidValido } from '../../shared/validacion.js';

/**
 * Atajos de gasto por plan (docs/plan-pro.md). Se cuentan los que ya existen: quien baja de Pro a Free
 * conserva los suyos (no se borra nada) pero no puede crear más hasta quedar por debajo del tope.
 */
export const LIMITE_ATAJOS_FREE = 3;
export const LIMITE_ATAJOS_PRO = 12;

const LARGO_MAXIMO_NOMBRE = 30;

export interface Atajo {
  id: string;
  nombre: string;
  montoValorMinimo: bigint;
  moneda: string;
  categoriaId: string | null;
}

export interface ListaDeAtajos {
  atajos: Atajo[];
  /** Cuántos puede tener esta persona según su plan, para que la pantalla muestre "2 de 3". */
  limite: number;
}

const COLUMNAS_ATAJO = {
  id: atajosGasto.id,
  nombre: atajosGasto.nombre,
  montoValorMinimo: atajosGasto.montoValorMinimo,
  moneda: atajosGasto.moneda,
  categoriaId: atajosGasto.categoriaId,
} as const;

async function limiteDelPlanTx(tx: Ejecutor, tenantId: string): Promise<number> {
  return (await obtenerPlanTenantTx(tx, tenantId)) === 'pro' ? LIMITE_ATAJOS_PRO : LIMITE_ATAJOS_FREE;
}

function limpiarNombre(nombre: string): string {
  const limpio = nombre.trim();
  if (limpio.length === 0) {
    throw new ErrorDominio('VALIDACION', 'El nombre del atajo no puede estar vacío');
  }
  if (limpio.length > LARGO_MAXIMO_NOMBRE) {
    throw new ErrorDominio('VALIDACION', `El nombre del atajo no puede pasar de ${LARGO_MAXIMO_NOMBRE} caracteres`);
  }
  return limpio;
}

function validarMonto(monto: bigint): void {
  if (monto <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto de un atajo debe ser positivo');
  }
}

/** Mismo criterio que `resolverCategoriaIdTx` de recurrentes: validar contra este tenant en vez de dejar que la FK dé un error genérico. */
async function resolverCategoriaIdTx(tx: Ejecutor, tenantId: string, categoriaId: string | null | undefined): Promise<string | null> {
  if (categoriaId === undefined || categoriaId === null) return null;
  const categoria = await obtenerCategoriaPorIdTx(tx, tenantId, categoriaId);
  if (!categoria) {
    throw new ErrorDominio('CATEGORIA_NO_ENCONTRADA', 'La categoría especificada no existe');
  }
  return categoria.id;
}

function errorNombreRepetido(nombre: string): ErrorDominio {
  return new ErrorDominio('VALIDACION', `Ya tienes un atajo llamado "${nombre}"`);
}

/** En el orden en que se crearon: el primero que armaste se queda primero. */
export async function listarAtajos(tenantId: string): Promise<ListaDeAtajos> {
  return conTenant(tenantId, async (tx) => {
    const atajos = await tx
      .select(COLUMNAS_ATAJO)
      .from(atajosGasto)
      .where(eq(atajosGasto.tenantId, tenantId))
      .orderBy(asc(atajosGasto.creadoEn), asc(atajosGasto.id));
    return { atajos, limite: await limiteDelPlanTx(tx, tenantId) };
  });
}

export interface CrearAtajoEntrada {
  tenantId: string;
  nombre: string;
  montoValorMinimo: bigint;
  moneda: string;
  categoriaId?: string | null;
}

/**
 * Comprobación por conteo, no un índice de la base: pasarse por uno bajo una carrera rarísima no
 * tiene ninguna consecuencia real (mismo criterio que las categorías personalizadas).
 */
export async function crearAtajo(entrada: CrearAtajoEntrada): Promise<Atajo> {
  const nombre = limpiarNombre(entrada.nombre);
  validarMonto(entrada.montoValorMinimo);

  return conTenant(entrada.tenantId, async (tx) => {
    const limite = await limiteDelPlanTx(tx, entrada.tenantId);
    const [fila] = await tx.select({ total: sql<number>`count(*)::int` }).from(atajosGasto).where(eq(atajosGasto.tenantId, entrada.tenantId));
    if ((fila?.total ?? 0) >= limite) {
      const tope = `Alcanzaste el límite de ${limite} atajos de tu plan`;
      throw new ErrorDominio(
        'LIMITE_ATAJOS_ALCANZADO',
        limite === LIMITE_ATAJOS_PRO
          ? `${tope}. Elimina uno para crear otro.`
          : cobrosHabilitados()
            ? `${tope} gratuito — Korly Pro permite hasta ${LIMITE_ATAJOS_PRO}`
            : `${tope} gratuito. Más atajos llegarán con Korly Pro: en Ajustes puedes pedir que te avisemos.`
      );
    }

    const categoriaId = await resolverCategoriaIdTx(tx, entrada.tenantId, entrada.categoriaId);
    try {
      const [atajo] = await tx
        .insert(atajosGasto)
        .values({ tenantId: entrada.tenantId, nombre, montoValorMinimo: entrada.montoValorMinimo, moneda: entrada.moneda, categoriaId })
        .returning(COLUMNAS_ATAJO);
      if (!atajo) throw new Error('No se pudo crear el atajo');
      return atajo;
    } catch (error) {
      if (esViolacionDeIndiceUnico(error)) throw errorNombreRepetido(nombre);
      throw error;
    }
  });
}

export interface ActualizarAtajoEntrada {
  tenantId: string;
  id: string;
  nombre?: string;
  montoValorMinimo?: bigint;
  moneda?: string;
  /** `null` quita la categoría; `undefined` la deja como está. */
  categoriaId?: string | null;
}

/** PATCH real: solo toca lo que se manda. */
export async function actualizarAtajo(entrada: ActualizarAtajoEntrada): Promise<Atajo> {
  const cambios: { nombre?: string; montoValorMinimo?: bigint; moneda?: string; categoriaId?: string | null } = {};
  if (entrada.nombre !== undefined) cambios.nombre = limpiarNombre(entrada.nombre);
  if (entrada.montoValorMinimo !== undefined) {
    validarMonto(entrada.montoValorMinimo);
    cambios.montoValorMinimo = entrada.montoValorMinimo;
    if (entrada.moneda !== undefined) cambios.moneda = entrada.moneda;
  }

  return conTenant(entrada.tenantId, async (tx) => {
    const actual = await obtenerAtajoPorIdTx(tx, entrada.tenantId, entrada.id);
    if (!actual) {
      throw new ErrorDominio('ATAJO_NO_ENCONTRADO', 'El atajo especificado no existe');
    }
    if (entrada.categoriaId !== undefined) {
      cambios.categoriaId = await resolverCategoriaIdTx(tx, entrada.tenantId, entrada.categoriaId);
    }
    if (Object.keys(cambios).length === 0) return actual;

    try {
      const [actualizado] = await tx
        .update(atajosGasto)
        .set(cambios)
        .where(and(eq(atajosGasto.tenantId, entrada.tenantId), eq(atajosGasto.id, entrada.id)))
        .returning(COLUMNAS_ATAJO);
      if (!actualizado) throw new Error('No se pudo actualizar el atajo');
      return actualizado;
    } catch (error) {
      if (esViolacionDeIndiceUnico(error)) throw errorNombreRepetido(cambios.nombre ?? actual.nombre);
      throw error;
    }
  });
}

/** `tenantId` en el `WHERE` es cinturón y tirantes: la política RLS de `atajos_gasto` es la defensa real. */
async function obtenerAtajoPorIdTx(tx: Ejecutor, tenantId: string, atajoId: string): Promise<Atajo | null> {
  if (!esUuidValido(atajoId)) return null;
  const [fila] = await tx
    .select(COLUMNAS_ATAJO)
    .from(atajosGasto)
    .where(and(eq(atajosGasto.tenantId, tenantId), eq(atajosGasto.id, atajoId)))
    .limit(1);
  return fila ?? null;
}

/** Un DELETE de verdad: nada apunta a un atajo (ver el comentario de la tabla). */
export async function eliminarAtajo(tenantId: string, atajoId: string): Promise<void> {
  return conTenant(tenantId, async (tx) => {
    const atajo = await obtenerAtajoPorIdTx(tx, tenantId, atajoId);
    if (!atajo) {
      throw new ErrorDominio('ATAJO_NO_ENCONTRADO', 'El atajo especificado no existe');
    }
    await tx.delete(atajosGasto).where(and(eq(atajosGasto.tenantId, tenantId), eq(atajosGasto.id, atajoId)));
  });
}
