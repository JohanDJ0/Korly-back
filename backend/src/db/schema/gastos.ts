import { sql } from 'drizzle-orm';
import { pgPolicy, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { categorias } from './categorias.js';
import { movimientos } from './ledger.js';
import { periodos } from './periodos.js';
import { appBackend } from './roles.js';
import { tenants } from './tenants.js';

/**
 * Gasto: mismo patrón que `ingresos` (ver db/schema/ingresos.ts) — tabla
 * delgada que solo vincula periodo↔movimiento; monto, moneda, fecha
 * efectiva y nota viven en `movimientos`. `categoriaId` es la única
 * excepción — vive aquí, no en `movimientos`, porque una categoría es
 * un atributo propio del gasto, no algo que ingresos/otros tipos de
 * movimiento necesiten (ver db/schema/categorias.ts).
 *
 * Inmutable vía el mismo trigger reutilizado que `ingresos` — y sigue
 * siéndolo incluso con editar/eliminar ya implementado (ver
 * modulos/gastos/registrar-gasto.ts, `editarGasto`/`eliminarGasto`):
 * esta fila nunca se actualiza ni se borra, ni siquiera para "solo
 * cambiar la categoría" — eso también genera una fila NUEVA, igual que
 * corregir el monto o la nota (mismo criterio, sin caso especial).
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
    categoriaId: uuid('categoria_id').references(() => categorias.id),
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
