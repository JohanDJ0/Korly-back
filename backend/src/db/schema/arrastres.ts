import { sql } from 'drizzle-orm';
import { bigint, pgPolicy, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { movimientos } from './ledger.js';
import { periodos } from './periodos.js';
import { resumenes } from './cierre.js';
import { appBackend } from './roles.js';
import { tenants } from './tenants.js';

/**
 * Rastrea el ciclo de vida de un arrastre de sobrante/déficit
 * (modelo-dominio.md §3, §4: "Arrastre de sobrante | Periodo siguiente
 * ← periodo cerrado"), desde que se drena la cuenta del periodo que
 * cierra hacia la cuenta `arrastre_pendiente` del tenant, hasta que un
 * periodo siguiente lo reclama.
 *
 * `periodoDestinoId`/`movimientoSalidaId` son NULL mientras el arrastre
 * sigue sin reclamarse — no hay límite de tiempo para eso, a diferencia
 * del default de N días de la decisión de sobrante (decidir-sobrante.ts),
 * que es un asunto de UX, no de dónde vive el dinero.
 *
 * Por qué existe esta tabla y no basta con el saldo de la cuenta
 * `arrastre_pendiente`: esa cuenta es un pozo común de TODOS los
 * arrastres sin reclamar de un tenant. Sin esta tabla, un periodo nuevo
 * no podría distinguir "sobrante ya decidido como arrastrar, listo
 * para reclamarse" de "sobrante todavía pendiente de decisión" — y
 * reclamar lo segundo adelantaría una decisión que el usuario no ha
 * tomado (ver modulos/cierre/materializar-arrastre.ts).
 */
export const arrastres = pgTable(
  'arrastres',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    resumenId: uuid('resumen_id')
      .notNull()
      .references(() => resumenes.id),
    periodoOrigenId: uuid('periodo_origen_id')
      .notNull()
      .references(() => periodos.id),
    montoValorMinimo: bigint('monto_valor_minimo', { mode: 'bigint' }).notNull(),
    moneda: text('moneda').notNull(),
    movimientoEntradaId: uuid('movimiento_entrada_id')
      .notNull()
      .references(() => movimientos.id),
    periodoDestinoId: uuid('periodo_destino_id').references(() => periodos.id),
    movimientoSalidaId: uuid('movimiento_salida_id').references(() => movimientos.id),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('arrastres_resumen_unico').on(t.resumenId),
    pgPolicy('arrastres_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();
