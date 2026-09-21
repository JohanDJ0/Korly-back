import { sql } from 'drizzle-orm';
import { boolean, pgPolicy, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { appBackend } from './roles.js';
import { tenants } from './tenants.js';

/**
 * Lista concreta de predeterminadas — modelo-dominio.md §6 la marcaba
 * "pendiente para wireframes, no es una decisión de dominio". Elegida
 * al construir este punto, confirmada con el usuario. Vive aquí (no en
 * el módulo de dominio) porque `resolverOcrearIdentidad` la siembra
 * directo por tenant al aprovisionar una identidad nueva, sin depender
 * del módulo de categorías completo.
 */
export const NOMBRES_CATEGORIAS_PREDETERMINADAS = [
  'Comida',
  'Transporte',
  'Vivienda',
  'Servicios',
  'Salud',
  'Entretenimiento',
  'Ropa',
  'Educación',
  'Ahorro',
  'Otros',
] as const;

/**
 * Categoría de gasto (modelo-dominio.md §1: "clasificación opcional del
 * movimiento. Predeterminada o personalizada"). Sin tabla compartida
 * entre tenants para las predeterminadas — cada tenant tiene sus
 * propias filas (sembradas al crear la identidad), manteniendo el
 * mismo patrón estricto de RLS + llave foránea real que el resto del
 * schema, sin una primera excepción de "fila global sin tenant_id".
 *
 * Solo aplica a gastos, nunca a ingresos — así lo define
 * `docs/openapi.yaml` (`categoriaId` existe en `Gasto`, nunca en
 * `Ingreso`).
 */
export const categorias = pgTable(
  'categorias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    nombre: text('nombre').notNull(),
    esPredeterminada: boolean('es_predeterminada').notNull().default(false),
    /**
     * Identificador de un set fijo (ver ICONOS_CATEGORIA_VALIDOS en
     * modulos/categorias/categorias.ts) — nunca el nombre de un ícono de
     * una librería específica, para no acoplar la base de datos a
     * lucide-react. `null` = sin ícono elegido, el cliente cae al
     * emparejamiento por palabra clave de siempre (lib/icono-categoria.tsx
     * en el frontend). La validación del set vive en la capa de dominio,
     * no aquí, para poder agregar íconos nuevos sin una migración.
     */
    icono: text('icono'),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('categorias_nombre_unico_por_tenant').on(t.tenantId, t.nombre),
    pgPolicy('categorias_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();
