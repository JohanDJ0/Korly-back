import { sql } from 'drizzle-orm';
import { bigint, check, date, pgPolicy, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { categorias } from './categorias.js';
import { movimientos } from './ledger.js';
import { periodos } from './periodos.js';
import { appBackend } from './roles.js';
import { tarjetas } from './tarjetas.js';
import { tenants } from './tenants.js';

/**
 * Una compra con tarjeta (documento-maestro-v2.md, "una compra a 12
 * MSI genera 12 compromisos futuros" — ver
 * modulos/tarjetas/registrar-cargo.ts). `movimientoId` apunta al
 * movimiento `'cargo_tarjeta'` que sube la deuda de la tarjeta en el
 * momento de la compra — separado de los `numeroPlazos` pagos
 * individuales (tabla `pagos_tarjeta`, abajo), que son los que de
 * verdad afectan el disponible de cada quincena, uno a la vez, cuando
 * a cada uno le toca.
 */
export const cargosTarjeta = pgTable(
  'cargos_tarjeta',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tarjetaId: uuid('tarjeta_id')
      .notNull()
      .references(() => tarjetas.id),
    movimientoId: uuid('movimiento_id')
      .notNull()
      .references(() => movimientos.id),
    descripcion: text('descripcion').notNull(),
    montoTotalValorMinimo: bigint('monto_total_valor_minimo', { mode: 'bigint' }).notNull(),
    moneda: text('moneda').notNull(),
    numeroPlazos: smallint('numero_plazos').notNull(),
    categoriaId: uuid('categoria_id').references(() => categorias.id),
    fechaCompra: date('fecha_compra').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('cargos_tarjeta_monto_positivo', sql`${t.montoTotalValorMinimo} > 0`),
    check('cargos_tarjeta_plazos_validos', sql`${t.numeroPlazos} >= 1`),
    pgPolicy('cargos_tarjeta_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();

/**
 * Una mensualidad individual de un cargo — se crean las `numeroPlazos`
 * de golpe al registrar el cargo (ya se conocen todas las fechas de
 * vencimiento desde ese momento, no hace falta esperar). `movimientoId`
 * nulo = todavía pendiente; se llena cuando
 * `materializarPagosTarjetaTx` (mismo mecanismo que
 * `materializarRecurrentesTx`) genera el `'pago_tarjeta'` real al
 * activarse el periodo que le toca. `periodoId` queda nulo hasta ese
 * mismo momento, por el mismo motivo.
 */
export const pagosTarjeta = pgTable(
  'pagos_tarjeta',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    cargoTarjetaId: uuid('cargo_tarjeta_id')
      .notNull()
      .references(() => cargosTarjeta.id),
    numeroPago: smallint('numero_pago').notNull(),
    montoValorMinimo: bigint('monto_valor_minimo', { mode: 'bigint' }).notNull(),
    fechaVencimiento: date('fecha_vencimiento').notNull(),
    periodoId: uuid('periodo_id').references(() => periodos.id),
    movimientoId: uuid('movimiento_id').references(() => movimientos.id),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('pagos_tarjeta_monto_positivo', sql`${t.montoValorMinimo} > 0`),
    check('pagos_tarjeta_numero_positivo', sql`${t.numeroPago} >= 1`),
    uniqueIndex('pagos_tarjeta_numero_unico_por_cargo').on(t.cargoTarjetaId, t.numeroPago),
    pgPolicy('pagos_tarjeta_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();
