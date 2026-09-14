import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { categorias } from '../../db/schema/categorias.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio, esViolacionDeIndiceUnico } from '../../shared/errores.js';

export interface Categoria {
  id: string;
  nombre: string;
  esPredeterminada: boolean;
}

/**
 * Documento Maestro §9.1: "categorías personalizadas gratis para
 * todos (límite alto, ~30)". No hay sistema de planes construido
 * todavía (Fase 3) — se aplica este número igual para todos por ahora;
 * es el único que existe en los docs, y sin él no habría ningún límite
 * real. Revisar cuando exista un sistema de planes de verdad.
 *
 * Comprobación por conteo, no un índice único de la base de datos —
 * a diferencia de "un solo periodo activo por tenant" (invariante 9,
 * protegida con un índice parcial porque violarla corrompe el
 * dominio), pasarse por una categoría bajo una carrera rarísima no
 * tiene ninguna consecuencia real; no amerita esa inversión.
 */
const LIMITE_CATEGORIAS_PERSONALIZADAS = 30;

const COLUMNAS_CATEGORIA = {
  id: categorias.id,
  nombre: categorias.nombre,
  esPredeterminada: categorias.esPredeterminada,
} as const;

/** Predeterminadas primero, alfabético dentro de cada grupo — orden estable para un selector en el cliente. */
export async function listarCategorias(tenantId: string): Promise<Categoria[]> {
  return conTenant(tenantId, (tx) =>
    tx
      .select(COLUMNAS_CATEGORIA)
      .from(categorias)
      .where(eq(categorias.tenantId, tenantId))
      .orderBy(desc(categorias.esPredeterminada), asc(categorias.nombre))
  );
}

export async function crearCategoriaPersonalizada(tenantId: string, nombre: string): Promise<Categoria> {
  const nombreLimpio = nombre.trim();
  if (nombreLimpio.length === 0) {
    throw new ErrorDominio('VALIDACION', 'El nombre de la categoría no puede estar vacío');
  }

  return conTenant(tenantId, async (tx) => {
    const [fila] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(categorias)
      .where(and(eq(categorias.tenantId, tenantId), eq(categorias.esPredeterminada, false)));
    if ((fila?.total ?? 0) >= LIMITE_CATEGORIAS_PERSONALIZADAS) {
      throw new ErrorDominio('LIMITE_CATEGORIAS_ALCANZADO', `Alcanzaste el límite de ${LIMITE_CATEGORIAS_PERSONALIZADAS} categorías personalizadas`);
    }

    try {
      const [categoria] = await tx
        .insert(categorias)
        .values({ tenantId, nombre: nombreLimpio, esPredeterminada: false })
        .returning(COLUMNAS_CATEGORIA);
      if (!categoria) throw new Error('No se pudo crear la categoría');
      return categoria;
    } catch (error) {
      if (esViolacionDeIndiceUnico(error)) {
        throw new ErrorDominio('VALIDACION', `Ya existe una categoría llamada "${nombreLimpio}"`);
      }
      throw error;
    }
  });
}

/**
 * Usado por registrar/editar gasto para validar `categoriaId`. Mismo
 * criterio BOLA que el resto (`obtenerPeriodoPorIdTx`, `obtenerMetaPorIdTx`):
 * `tenantId` en el `WHERE` es cinturón y tirantes, la política RLS de
 * `categorias` es la defensa real.
 */
export async function obtenerCategoriaPorIdTx(tx: Ejecutor, tenantId: string, categoriaId: string): Promise<Categoria | null> {
  const [fila] = await tx
    .select(COLUMNAS_CATEGORIA)
    .from(categorias)
    .where(and(eq(categorias.tenantId, tenantId), eq(categorias.id, categoriaId)))
    .limit(1);
  return fila ?? null;
}
