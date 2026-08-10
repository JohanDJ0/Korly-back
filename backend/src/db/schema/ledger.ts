import { sql } from 'drizzle-orm';
import { bigint, check, date, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { appBackend } from './roles.js';
import { tenants } from './tenants.js';

/**
 * Motor genérico de partida doble (ADR-001). Este módulo no sabe qué es
 * un periodo, un gasto o una meta — eso lo saben los módulos que lo usan
 * (periodos, ingresos, gastos, metas), llamando a
 * modulos/ledger/registrar-movimiento.ts. Aquí solo vive el mecanismo:
 * cuentas, movimientos y los asientos que los componen.
 */

// Vocabulario fijo tomado de modelo-dominio.md §1 y §4. Se valida con un
// CHECK en la base de datos (abajo) además del tipo de TypeScript; son
// pocos valores y cambian raramente, así que se aceptan duplicados entre
// ambos en vez de generar uno desde el otro.
export const TIPOS_CUENTA = ['periodo', 'meta', 'efectivo', 'banco', 'tarjeta'] as const;
export type TipoCuenta = (typeof TIPOS_CUENTA)[number];

export const TIPOS_MOVIMIENTO = [
  'ingreso',
  'gasto',
  'arrastre_sobrante',
  'aporte_meta',
  'retiro_meta',
  'reversion',
] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const cuentas = pgTable(
  'cuentas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tipo: text('tipo').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('cuentas_tipo_valido', sql`${t.tipo} in ('periodo','meta','efectivo','banco','tarjeta')`),
    pgPolicy('cuentas_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();

/**
 * Agrupación de asientos con sentido de negocio (modelo-dominio.md §1).
 * `fechaRegistro` (cuándo se capturó) y `fechaEfectiva` (cuándo ocurrió
 * realmente) son campos distintos a propósito — hacen posible el gasto
 * retroactivo sin tocar el pasado (modelo-dominio.md §4).
 *
 * Inmutable a nivel de base de datos: ver migración 0002 (trigger que
 * bloquea UPDATE/DELETE). Una corrección es un `movimientoRevertidoId`
 * apuntando al movimiento original, nunca una edición.
 *
 * PENDIENTE: la columna existe pero ningún código la genera todavía —
 * es preparación de estructura, no el mecanismo de reversión completo.
 * Ver el comentario sobre `movimientoRevertidoId` en
 * modulos/ledger/registrar-movimiento.ts.
 */
export const movimientos = pgTable(
  'movimientos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tipo: text('tipo').notNull(),
    moneda: text('moneda').notNull(),
    fechaEfectiva: date('fecha_efectiva').notNull(),
    fechaRegistro: timestamp('fecha_registro', { withTimezone: true }).notNull().defaultNow(),
    nota: text('nota'),
    movimientoRevertidoId: uuid('movimiento_revertido_id').references((): any => movimientos.id),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'movimientos_tipo_valido',
      sql`${t.tipo} in ('ingreso','gasto','arrastre_sobrante','aporte_meta','retiro_meta','reversion')`
    ),
    pgPolicy('movimientos_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();

/**
 * Movimiento atómico e inmutable (ADR-001, invariantes 1-4 de
 * modelo-dominio.md). `montoValorMinimo` es un entero CON SIGNO en la
 * unidad mínima de la moneda (ADR-002): positivo aumenta el saldo de la
 * cuenta, negativo lo reduce. `cuentaId` puede ser NULL — representa la
 * contraparte externa al sistema (de dónde viene un ingreso, a dónde va
 * un gasto) en el modo simple del MVP, que no rastrea cuentas bancarias
 * reales (documento-maestro-v2.md §7.2). No existe una fila de "cuenta
 * externa": modelarlo como NULL evita inventar una entidad cuyo saldo
 * nunca se consulta.
 *
 * Dos invariantes NO expresables en el schema de Drizzle se aplican con
 * triggers en la migración 0002:
 * - La suma de `montoValorMinimo` de los asientos de un mismo
 *   `movimientoId` es exactamente cero (invariante 1).
 *   Constraint trigger DEFERRABLE: permite insertar los asientos de un
 *   movimiento uno por uno dentro de la misma transacción y valida la
 *   suma solo al hacer commit.
 * - Todos los asientos de un mismo `movimientoId` comparten `moneda`.
 * - Ningún asiento se modifica ni se elimina jamás (invariante 2).
 *
 * `montoValorMinimo` usa `bigint` (JS `bigint`, no `number`): un entero
 * de 32 bits se queda corto bien dentro del rango de montos reales en
 * centavos. Pendiente para cuando exista una capa HTTP: `bigint` no
 * serializa con `JSON.stringify` sin una conversión explícita.
 */
export const asientos = pgTable(
  'asientos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    movimientoId: uuid('movimiento_id')
      .notNull()
      .references(() => movimientos.id),
    cuentaId: uuid('cuenta_id').references(() => cuentas.id),
    montoValorMinimo: bigint('monto_valor_minimo', { mode: 'bigint' }).notNull(),
    moneda: text('moneda').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy('asientos_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();
