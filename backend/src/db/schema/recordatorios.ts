import { sql } from 'drizzle-orm';
import { check, date, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { appBackend } from './roles.js';
import { tenants } from './tenants.js';

export const TIPOS_RECORDATORIO = ['diario'] as const;
export type TipoRecordatorio = (typeof TIPOS_RECORDATORIO)[number];

/**
 * Registro de cada recordatorio por correo que sí se mandó
 * (documento-maestro-v2.md §13.4). Dos propósitos en una sola fila:
 *
 * 1. **Idempotencia** — el job (`scripts/enviar-recordatorios.ts`)
 *    corre como cron y CLAUDE.md exige que los jobs toleren correr dos
 *    veces (o ninguna). El índice único de abajo es lo que hace que un
 *    segundo disparo del mismo día para el mismo tenant no mande un
 *    correo duplicado.
 * 2. **Frecuencia decreciente (regla 3, obligatoria)** — sin un
 *    historial de qué se mandó y cuándo, no hay forma de saber si el
 *    usuario ha estado ignorando los últimos recordatorios. Ver
 *    `modulos/notificaciones/enviar-recordatorios.ts`.
 *
 * `tipo` ya distingue `'diario'` (esta primera iteración) de una
 * futura alerta de ritmo (regla 4) — mismo criterio que
 * `TIPOS_MOVIMIENTO`: un valor cerrado que crece cuando de verdad
 * exista el segundo tipo, no antes.
 */
export const recordatoriosEnviados = pgTable(
  'recordatorios_enviados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    fecha: date('fecha').notNull(),
    tipo: text('tipo').notNull().$type<TipoRecordatorio>(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('recordatorios_enviados_tipo_valido', sql`${t.tipo} in ('diario')`),
    uniqueIndex('recordatorios_enviados_unico_por_dia').on(t.tenantId, t.fecha, t.tipo),
    pgPolicy('recordatorios_enviados_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();
