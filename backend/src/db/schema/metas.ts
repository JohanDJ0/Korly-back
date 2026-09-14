import { sql } from 'drizzle-orm';
import { bigint, check, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { cuentas } from './ledger.js';
import { appBackend } from './roles.js';
import { tenants } from './tenants.js';

/**
 * Meta de ahorro (modelo-dominio.md §1, §4, §6). `cuentaId` es la cuenta
 * del ledger (tipo 'meta') cuyo saldo es `montoAcumulado` — se crea
 * junto con la fila de meta, en la misma transacción, mismo patrón que
 * `periodos.cuentaId`. Nunca se guarda `montoAcumulado` ni
 * `porcentajeAvance`: se calculan en cada lectura desde el saldo real
 * del ledger (`obtenerSaldoCuenta`), igual que `disponible`.
 *
 * Sin `estado` (activa/completada/archivada) ni borrado — fuera del
 * alcance "básico" que pide `docs/openapi.yaml` (solo crear, listar,
 * aportar, retirar). Agregar eso es una extensión futura, no algo que
 * el contrato actual necesite.
 */
export const metas = pgTable(
  'metas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    cuentaId: uuid('cuenta_id')
      .notNull()
      .references(() => cuentas.id),
    nombre: text('nombre').notNull(),
    montoObjetivoValorMinimo: bigint('monto_objetivo_valor_minimo', { mode: 'bigint' }).notNull(),
    moneda: text('moneda').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // `montoObjetivoValorMinimo` sí se guarda tal cual (a diferencia de
    // los montos de ingresos/gastos, delegados al ledger) — es un
    // objetivo declarado, no un movimiento. Defensa en profundidad
    // además de la validación en `crearMeta`.
    check('metas_monto_objetivo_positivo', sql`${t.montoObjetivoValorMinimo} > 0`),
    pgPolicy('metas_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();
