import { sql } from 'drizzle-orm';
import { bigint, boolean, check, pgPolicy, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { categorias } from './categorias.js';
import { appBackend } from './roles.js';
import { tenants } from './tenants.js';

export const FRECUENCIAS_RECURRENTE = ['quincenal', 'mensual'] as const;
export type FrecuenciaRecurrente = (typeof FRECUENCIAS_RECURRENTE)[number];

/**
 * Plantilla de gasto recurrente (documento-maestro-v2.md §12,
 * "gastos recurrentes/suscripciones" — brecha F2). Es una plantilla,
 * no un hecho del ledger (mismo estatus que `metas`/`categorias`): se
 * puede editar y pausar libremente, nunca genera un movimiento por sí
 * misma. `activo=false` es el "eliminar" de esta tabla — nunca hard
 * delete, porque los gastos ya materializados (`gastos.origenRecurrenteId`)
 * apuntan aquí y perderían su procedencia.
 *
 * `diaMes` solo tiene sentido para `'mensual'`: como los periodos son
 * quincenas ancladas a calendario (1-15, 16-fin — ADR-004), un cargo
 * mensual con un día fijo cae siempre en la misma mitad del mes, nunca
 * en las dos — ver `materializar-recurrentes.ts`.
 */
export const gastosRecurrentes = pgTable(
  'gastos_recurrentes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    descripcion: text('descripcion').notNull(),
    montoValorMinimo: bigint('monto_valor_minimo', { mode: 'bigint' }).notNull(),
    moneda: text('moneda').notNull(),
    categoriaId: uuid('categoria_id').references(() => categorias.id),
    frecuencia: text('frecuencia').notNull().$type<FrecuenciaRecurrente>(),
    diaMes: smallint('dia_mes'),
    activo: boolean('activo').notNull().default(true),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('gastos_recurrentes_monto_positivo', sql`${t.montoValorMinimo} > 0`),
    check('gastos_recurrentes_frecuencia_valida', sql`${t.frecuencia} in ('quincenal', 'mensual')`),
    // Defensa en profundidad además de la validación en el módulo:
    // `diaMes` obligatorio y en rango si y solo si la frecuencia lo usa.
    check(
      'gastos_recurrentes_dia_mes_coherente',
      sql`(${t.frecuencia} = 'mensual' AND ${t.diaMes} BETWEEN 1 AND 31) OR (${t.frecuencia} = 'quincenal' AND ${t.diaMes} IS NULL)`
    ),
    pgPolicy('gastos_recurrentes_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();
