import { sql } from 'drizzle-orm';
import { bigint, check, pgPolicy, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { periodos } from './periodos.js';
import { appBackend } from './roles.js';
import { tenants } from './tenants.js';

/**
 * Estado guardado en `resumenes.decisionSobrante` — distinto de lo que
 * el usuario elige al decidir (ver `DecisionSobranteEntrada` en
 * modulos/cierre/decidir-sobrante.ts, que es 'ahorrar' | 'arrastrar').
 * `'pendiente'` es el único estado desde el que se puede transicionar;
 * la migración de este módulo tiene un trigger que lo hace cumplir.
 */
export const ESTADOS_DECISION_SOBRANTE = ['pendiente', 'ahorrado', 'arrastrado'] as const;
export type EstadoDecisionSobrante = (typeof ESTADOS_DECISION_SOBRANTE)[number];

/**
 * Resumen de periodo (modelo-dominio.md §1): snapshot generado al
 * cerrar. `totalIngresosValorMinimo`/`totalGastadoValorMinimo` son
 * magnitudes no negativas; `sobranteValorMinimo` sí lleva signo (un
 * déficit es negativo).
 *
 * Solo `decisionSobrante`/`decisionSobranteFecha` pueden cambiar
 * después del INSERT — de `pendiente` a `ahorrado`/`arrastrado`,
 * exactamente una vez. Todo lo demás (los tres montos, la moneda,
 * `generadoEn`) es inmutable desde que se genera, igual que el resto
 * del ledger. La migración de este módulo trae un trigger que hace
 * cumplir precisamente esa transición y bloquea cualquier otra —
 * distinto del bloqueo total que usan `ingresos`/`gastos`/`movimientos`,
 * porque aquí sí hay exactamente un campo que debe poder escribirse una
 * vez después del INSERT.
 */
export const resumenes = pgTable(
  'resumenes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    periodoId: uuid('periodo_id')
      .notNull()
      .references(() => periodos.id),
    totalIngresosValorMinimo: bigint('total_ingresos_valor_minimo', { mode: 'bigint' }).notNull(),
    totalGastadoValorMinimo: bigint('total_gastado_valor_minimo', { mode: 'bigint' }).notNull(),
    sobranteValorMinimo: bigint('sobrante_valor_minimo', { mode: 'bigint' }).notNull(),
    moneda: text('moneda').notNull(),
    decisionSobrante: text('decision_sobrante').notNull().default('pendiente'),
    decisionSobranteFecha: timestamp('decision_sobrante_fecha', { withTimezone: true }),
    generadoEn: timestamp('generado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('resumenes_periodo_unico').on(t.periodoId),
    check('resumenes_decision_valida', sql`${t.decisionSobrante} in ('pendiente','ahorrado','arrastrado')`),
    check(
      'resumenes_decision_fecha_consistente',
      sql`(${t.decisionSobrante} = 'pendiente' and ${t.decisionSobranteFecha} is null)
          or (${t.decisionSobrante} <> 'pendiente' and ${t.decisionSobranteFecha} is not null)`
    ),
    pgPolicy('resumenes_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();
