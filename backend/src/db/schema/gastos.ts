import { sql } from 'drizzle-orm';
import { pgPolicy, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { movimientos } from './ledger.js';
import { periodos } from './periodos.js';
import { appBackend } from './roles.js';
import { tenants } from './tenants.js';

/**
 * Gasto: mismo patrón que `ingresos` (ver db/schema/ingresos.ts) — tabla
 * delgada que solo vincula periodo↔movimiento; monto, moneda, fecha
 * efectiva y nota viven en `movimientos`.
 *
 * Sin `categoriaId`: el módulo de categorías no existe todavía en el
 * walking skeleton (documento-maestro-v2.md §4.1 las marca opcionales
 * de todas formas). Agregar la columna ahora, sin tabla de categorías
 * real a la cual apuntar, sería peor que omitirla — se agrega cuando
 * ese módulo exista, no antes.
 *
 * Inmutable vía el mismo trigger reutilizado que `ingresos` — y sigue
 * siéndolo incluso con editar/eliminar ya implementado (ver
 * modulos/gastos/registrar-gasto.ts, `editarGasto`/`eliminarGasto`):
 * esta fila nunca se actualiza ni se borra. Corregir un gasto genera una
 * reversión de su movimiento y, en una edición, una fila NUEVA aquí para
 * el monto corregido — la fila original queda igual, para siempre.
 */
export const gastos = pgTable(
  'gastos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    periodoId: uuid('periodo_id')
      .notNull()
      .references(() => periodos.id),
    movimientoId: uuid('movimiento_id')
      .notNull()
      .references(() => movimientos.id),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy('gastos_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();
