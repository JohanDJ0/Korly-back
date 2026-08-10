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
 * Sin edición/eliminación: el endpoint que lo permitiría (con reversión
 * automática si el periodo ya cerró, ver openapi.yaml `PATCH/DELETE
 * /gastos/{gastoId}`) está fuera de alcance de este punto. Por ahora es
 * inmutable igual que ingresos, vía el mismo trigger reutilizado.
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
