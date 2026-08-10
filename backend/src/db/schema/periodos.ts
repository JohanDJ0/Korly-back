import { sql } from 'drizzle-orm';
import { check, date, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { cuentas } from './ledger.js';
import { appBackend } from './roles.js';
import { tenants } from './tenants.js';

/**
 * ADR-004 define cuatro tipos (quincenal, semanal, mensual,
 * personalizado). Solo 'quincenal' está implementado — es el caso
 * dominante y el default del producto (documento-maestro-v2.md §7.4).
 * El CHECK de abajo es deliberadamente más angosto que el vocabulario
 * completo de ADR-004: ampliarlo es la señal de que el tipo ya tiene
 * código real que calcula su anclaje, no antes.
 */
export const TIPOS_PERIODO_SOPORTADOS = ['quincenal'] as const;
export type TipoPeriodoSoportado = (typeof TIPOS_PERIODO_SOPORTADOS)[number];

export const ESTADOS_PERIODO = ['borrador', 'activo', 'cerrado', 'archivado'] as const;
export type EstadoPeriodo = (typeof ESTADOS_PERIODO)[number];

/**
 * Unidad de planeación (modelo-dominio.md §1). `cuentaId` es la cuenta
 * del ledger (tipo 'periodo') cuyo saldo es el "disponible" del periodo
 * — se crea junto con la fila de periodo, en la misma transacción (ver
 * modulos/periodos/crear-periodo.ts).
 *
 * Solo cubre borrador → activo (invariantes 6-10 de modelo-dominio.md).
 * La transición activo → cerrado, el resumen inmutable y la decisión de
 * sobrante son del módulo de cierre, que todavía no existe — un periodo
 * puede quedar 'activo' más allá de su fechaFin sin que nada lo detecte
 * todavía. Ver README para el detalle de qué falta.
 */
export const periodos = pgTable(
  'periodos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    cuentaId: uuid('cuenta_id')
      .notNull()
      .references(() => cuentas.id),
    tipo: text('tipo').notNull(),
    estado: text('estado').notNull().default('borrador'),
    fechaInicio: date('fecha_inicio').notNull(),
    fechaFin: date('fecha_fin').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('periodos_tipo_valido', sql`${t.tipo} in ('quincenal')`),
    check('periodos_estado_valido', sql`${t.estado} in ('borrador','activo','cerrado','archivado')`),
    // Invariante 9 (modelo-dominio.md): solo un periodo activo por
    // tenant. Es un índice parcial, no solo una regla de aplicación —
    // defensa en profundidad contra una carrera entre dos requests de
    // "crear periodo" casi simultáneas (ver crear-periodo.ts, que
    // reintenta como 'borrador' si este índice rechaza el insert).
    uniqueIndex('periodos_un_activo_por_tenant').on(t.tenantId).where(sql`estado = 'activo'`),
    pgPolicy('periodos_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();
