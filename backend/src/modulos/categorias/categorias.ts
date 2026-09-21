import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { cargosTarjeta } from '../../db/schema/cargos-tarjeta.js';
import { categorias } from '../../db/schema/categorias.js';
import { gastos } from '../../db/schema/gastos.js';
import { gastosRecurrentes } from '../../db/schema/gastos-recurrentes.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio, esViolacionDeIndiceUnico } from '../../shared/errores.js';
import { esUuidValido } from '../../shared/validacion.js';

export interface Categoria {
  id: string;
  nombre: string;
  esPredeterminada: boolean;
  icono: string | null;
}

/**
 * Set fijo y curado — nunca el nombre de un ícono de una librería
 * específica (ver el comentario de la columna en db/schema/categorias.ts).
 * El frontend (lib/icono-categoria.tsx) mapea cada una de estas claves a
 * un ícono real; agregar una nueva aquí no requiere migración, solo
 * actualizar ambos lados. `'otros'` es el respaldo genérico, siempre
 * disponible.
 */
export const ICONOS_CATEGORIA_VALIDOS = [
  'comida',
  'transporte',
  'vivienda',
  'servicios',
  'salud',
  'entretenimiento',
  'ropa',
  'educacion',
  'ahorro',
  'compras',
  'proyectos',
  'mascotas',
  'viajes',
  'regalos',
  'tecnologia',
  'otros',
] as const;

export type IconoCategoria = (typeof ICONOS_CATEGORIA_VALIDOS)[number];

function validarIcono(icono: string | null | undefined): void {
  if (icono !== null && icono !== undefined && !ICONOS_CATEGORIA_VALIDOS.includes(icono as IconoCategoria)) {
    throw new ErrorDominio('VALIDACION', `El campo 'icono' debe ser uno de: ${ICONOS_CATEGORIA_VALIDOS.join(', ')}`);
  }
}

/** Íconos razonables para las 10 predeterminadas (resolver-identidad.ts) — el usuario puede cambiarlos después, esto solo evita que nazcan todas con el genérico "otros". */
export const ICONO_POR_NOMBRE_PREDETERMINADA: Record<string, IconoCategoria> = {
  Comida: 'comida',
  Transporte: 'transporte',
  Vivienda: 'vivienda',
  Servicios: 'servicios',
  Salud: 'salud',
  Entretenimiento: 'entretenimiento',
  Ropa: 'ropa',
  Educación: 'educacion',
  Ahorro: 'ahorro',
  Otros: 'otros',
};

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
  icono: categorias.icono,
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

export async function crearCategoriaPersonalizada(tenantId: string, nombre: string, icono?: string | null): Promise<Categoria> {
  const nombreLimpio = nombre.trim();
  if (nombreLimpio.length === 0) {
    throw new ErrorDominio('VALIDACION', 'El nombre de la categoría no puede estar vacío');
  }
  validarIcono(icono);

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
        .values({ tenantId, nombre: nombreLimpio, esPredeterminada: false, icono: icono ?? null })
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

export interface ActualizarCategoriaEntrada {
  nombre?: string;
  icono?: string | null;
}

/**
 * Nombre e ícono, ambos opcionales — un `PATCH` real, solo toca lo que
 * el caller mande. `esPredeterminada` nunca se toca aquí: nada le
 * impide a una predeterminada cambiar de nombre o ícono (siguen siendo
 * la misma fila sembrada, solo con otra etiqueta), lo único protegido
 * de verdad es "no se puede eliminar" (`eliminarCategoria`) — esa sí es
 * la garantía real de que todo tenant nuevo arranca con un set base.
 */
export async function actualizarCategoria(tenantId: string, categoriaId: string, entrada: ActualizarCategoriaEntrada): Promise<Categoria> {
  validarIcono(entrada.icono);

  const cambios: { nombre?: string; icono?: string | null } = {};
  if (entrada.nombre !== undefined) {
    const nombreLimpio = entrada.nombre.trim();
    if (nombreLimpio.length === 0) {
      throw new ErrorDominio('VALIDACION', 'El nombre de la categoría no puede estar vacío');
    }
    cambios.nombre = nombreLimpio;
  }
  if (entrada.icono !== undefined) {
    cambios.icono = entrada.icono;
  }

  return conTenant(tenantId, async (tx) => {
    const categoria = await obtenerCategoriaPorIdTx(tx, tenantId, categoriaId);
    if (!categoria) {
      throw new ErrorDominio('CATEGORIA_NO_ENCONTRADA', 'La categoría especificada no existe');
    }
    if (Object.keys(cambios).length === 0) return categoria;

    try {
      const [actualizada] = await tx
        .update(categorias)
        .set(cambios)
        .where(and(eq(categorias.tenantId, tenantId), eq(categorias.id, categoriaId)))
        .returning(COLUMNAS_CATEGORIA);
      if (!actualizada) throw new Error('No se pudo actualizar la categoría');
      return actualizada;
    } catch (error) {
      if (esViolacionDeIndiceUnico(error)) {
        throw new ErrorDominio('VALIDACION', `Ya existe una categoría llamada "${cambios.nombre}"`);
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
  if (!esUuidValido(categoriaId)) return null;

  const [fila] = await tx
    .select(COLUMNAS_CATEGORIA)
    .from(categorias)
    .where(and(eq(categorias.tenantId, tenantId), eq(categorias.id, categoriaId)))
    .limit(1);
  return fila ?? null;
}

/**
 * Solo las personalizadas se pueden eliminar — las predeterminadas
 * las siembra `resolverOcrearIdentidad` para todos los tenants, no
 * son un dato del usuario que le pertenezca borrar. Y solo si nunca
 * se usó: a diferencia de `tarjetas`/`metas` (una sola cuenta del
 * ledger que revisar), una categoría puede estar referenciada desde
 * tres tablas distintas (`gastos`, `gastos_recurrentes`,
 * `cargos_tarjeta`) — `categoriaId` es nullable en las tres, así que
 * Postgres no lo impediría con una FK, pero dejar gastos ya
 * registrados apuntando a una categoría borrada rompería el reporte
 * de "gastado por categoría" (generar-resumen.ts) en silencio.
 */
export async function eliminarCategoria(tenantId: string, categoriaId: string): Promise<void> {
  return conTenant(tenantId, async (tx) => {
    const categoria = await obtenerCategoriaPorIdTx(tx, tenantId, categoriaId);
    if (!categoria) {
      throw new ErrorDominio('CATEGORIA_NO_ENCONTRADA', 'La categoría especificada no existe');
    }
    if (categoria.esPredeterminada) {
      throw new ErrorDominio('CATEGORIA_PREDETERMINADA', 'No se puede eliminar una categoría predeterminada');
    }

    const [gastosFila] = await tx.select({ total: sql<number>`count(*)::int` }).from(gastos).where(eq(gastos.categoriaId, categoriaId));
    const [recurrentesFila] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(gastosRecurrentes)
      .where(eq(gastosRecurrentes.categoriaId, categoriaId));
    const [cargosFila] = await tx.select({ total: sql<number>`count(*)::int` }).from(cargosTarjeta).where(eq(cargosTarjeta.categoriaId, categoriaId));
    if ((gastosFila?.total ?? 0) > 0 || (recurrentesFila?.total ?? 0) > 0 || (cargosFila?.total ?? 0) > 0) {
      throw new ErrorDominio('CATEGORIA_EN_USO', 'No se puede eliminar una categoría que ya está en uso');
    }

    await tx.delete(categorias).where(and(eq(categorias.tenantId, tenantId), eq(categorias.id, categoriaId)));
  });
}
