import { sql } from 'drizzle-orm';
import { pgPolicy, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { movimientos } from './ledger.js';
import { periodos } from './periodos.js';
import { appBackend } from './roles.js';
import { tenants } from './tenants.js';

/**
 * Ingreso: evento de llegada de dinero, ligado al periodo que financia
 * (ADR-007) — no necesariamente al periodo en que cae su fecha real.
 *
 * Deliberadamente delgada: el monto, la moneda, la fecha efectiva y la
 * nota NO se duplican aquí — viven en `movimientos` (vía
 * `movimientoId`), que ya los guarda para el asiento de ledger que este
 * ingreso genera. Esta tabla solo agrega el hecho específico del
 * dominio que el ledger no puede saber por sí mismo: a qué periodo
 * pertenece. Leer un ingreso completo implica un JOIN a `movimientos`.
 *
 * Inmutable igual que el ledger (reutiliza el trigger
 * `ledger_bloquear_mutacion` de la migración 0002 — ver migración de
 * este módulo): un ingreso no se edita ni se borra, consistente con
 * "nada de hard delete en el dominio financiero" (CLAUDE.md). No hay
 * caso de uso en el walking skeleton que lo necesite; si aparece,
 * el patrón es el mismo que gastos: reversión, nunca mutación.
 */
export const ingresos = pgTable(
  'ingresos',
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
    pgPolicy('ingresos_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();
