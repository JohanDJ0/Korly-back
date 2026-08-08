import { sql } from 'drizzle-orm';
import { pgPolicy, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { appBackend } from './roles.js';

/**
 * Unidad de aislamiento (ADR-005). En el MVP cada usuario personal es su
 * propio tenant de un solo miembro; Business reutilizará la misma tabla
 * con varios usuarios por tenant sin migración estructural.
 *
 * Políticas RLS:
 * - Lectura/edición: solo la fila cuyo id coincide con el tenant de la
 *   sesión actual (`app.tenant_id`). Nadie puede listar tenants ajenos.
 * - Alta: sin restricción de contenido (withCheck true). La creación de
 *   un tenant ocurre exclusivamente durante el aprovisionamiento de una
 *   identidad nueva (ver modulos/identidad/resolver-identidad.ts), antes
 *   de que exista un `app.tenant_id` que verificar contra la fila.
 */
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy('tenants_lectura_propia', {
      for: 'select',
      to: appBackend,
      using: sql`${t.id} = current_setting('app.tenant_id', true)::uuid`,
    }),
    pgPolicy('tenants_alta_aprovisionamiento', {
      for: 'insert',
      to: appBackend,
      withCheck: sql`true`,
    }),
  ]
).enableRLS();
