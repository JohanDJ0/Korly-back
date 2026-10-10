import { sql } from 'drizzle-orm';
import { bigint, check, pgPolicy, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { categorias } from './categorias.js';
import { appBackend } from './roles.js';
import { tenants } from './tenants.js';

/**
 * Atajo de gasto: una plantilla (nombre + monto + categoría opcional) que la persona arma para
 * registrar con un toque un gasto que repite ("Café $55"). Es configuración, no un hecho del
 * ledger (mismo estatus que `gastos_recurrentes`/`categorias`): nunca genera un movimiento por
 * sí misma — al tocarlo, la app registra un gasto normal por el endpoint de siempre.
 *
 * Como nada apunta a esta tabla (los gastos registrados no guardan de qué atajo salieron),
 * eliminar un atajo es un DELETE de verdad, a diferencia de los recurrentes. Sí apunta a
 * `categorias`: al eliminar una categoría, `eliminarCategoria` suelta antes la referencia de
 * los atajos (el atajo se queda, solo sin categoría).
 *
 * `moneda` se guarda aunque hoy todo sea MXN, igual que en el resto de las tablas con montos.
 */
export const atajosGasto = pgTable(
  'atajos_gasto',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    nombre: text('nombre').notNull(),
    montoValorMinimo: bigint('monto_valor_minimo', { mode: 'bigint' }).notNull(),
    moneda: text('moneda').notNull(),
    categoriaId: uuid('categoria_id').references(() => categorias.id),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('atajos_gasto_nombre_unico_por_tenant').on(t.tenantId, t.nombre),
    check('atajos_gasto_monto_positivo', sql`${t.montoValorMinimo} > 0`),
    check('atajos_gasto_nombre_no_vacio', sql`length(btrim(${t.nombre})) > 0`),
    pgPolicy('atajos_gasto_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();
