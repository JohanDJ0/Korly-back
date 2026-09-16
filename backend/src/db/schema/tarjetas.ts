import { sql } from 'drizzle-orm';
import { bigint, check, pgPolicy, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { cuentas } from './ledger.js';
import { appBackend } from './roles.js';
import { tenants } from './tenants.js';

/**
 * Tarjeta de crédito (documento-maestro-v2.md, diferenciador #3:
 * "tarjetas de crédito y MSI modelados nativamente"). `cuentaId` es la
 * cuenta del ledger (tipo 'tarjeta') cuyo saldo representa la deuda —
 * a diferencia de `metas`/`periodos`, aquí un saldo negativo es lo
 * normal: cada cargo la vuelve más negativa, cada mensualidad pagada
 * la acerca a cero. Mismo patrón que `metas.cuentaId`: se crea junto
 * con la fila de tarjeta, en la misma transacción.
 *
 * `diasParaPago` en vez de un "día límite de pago" fijo: los bancos
 * mexicanos calculan la fecha límite como "N días después del corte"
 * (usualmente ~20), no como un día fijo del mes — evita el caso raro
 * de una fecha límite que cae antes que su propio corte en meses
 * cortos.
 */
export const tarjetas = pgTable(
  'tarjetas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    cuentaId: uuid('cuenta_id')
      .notNull()
      .references(() => cuentas.id),
    nombre: text('nombre').notNull(),
    limiteCreditoValorMinimo: bigint('limite_credito_valor_minimo', { mode: 'bigint' }).notNull(),
    moneda: text('moneda').notNull(),
    diaCorte: smallint('dia_corte').notNull(),
    diasParaPago: smallint('dias_para_pago').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('tarjetas_limite_credito_positivo', sql`${t.limiteCreditoValorMinimo} > 0`),
    check('tarjetas_dia_corte_valido', sql`${t.diaCorte} BETWEEN 1 AND 31`),
    check('tarjetas_dias_para_pago_positivo', sql`${t.diasParaPago} > 0`),
    pgPolicy('tarjetas_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();
