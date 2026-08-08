import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { db } from '../../shared/db.js';
import { identidadesExternas } from '../../db/schema/identidad.js';
import { tenants } from '../../db/schema/tenants.js';
import { usuarios } from '../../db/schema/identidad.js';

const PROVEEDOR_SUPABASE = 'supabase';

export interface IdentidadResuelta {
  usuarioId: string;
  tenantId: string;
}

type Ejecutor = typeof db | PgTransaction<any, any, any>;

/**
 * Encuentra el usuario interno asociado a un id de Supabase Auth, o lo
 * aprovisiona en su primer login (no hay endpoint de registro separado
 * en el walking skeleton — ver ADR-003 y ADR-005).
 *
 * `idEnProveedor` debe venir siempre de un id ya verificado por el
 * proveedor de auth (ver src/shared/auth.ts: `data.user.id` que devuelve
 * `supabaseAdmin.auth.getUser(token)`), nunca de un valor que el cliente
 * pueda escribir directamente en un body/query/param.
 */
export async function resolverOcrearIdentidad(idEnProveedor: string): Promise<IdentidadResuelta> {
  const existente = await buscarIdentidadExistente(db, idEnProveedor);
  if (existente) return existente;
  return aprovisionarIdentidadNueva(idEnProveedor);
}

async function buscarIdentidadExistente(ejecutor: Ejecutor, idEnProveedor: string): Promise<IdentidadResuelta | null> {
  const [fila] = await ejecutor
    .select({ usuarioId: identidadesExternas.usuarioId, tenantId: identidadesExternas.tenantId })
    .from(identidadesExternas)
    .where(and(eq(identidadesExternas.proveedor, PROVEEDOR_SUPABASE), eq(identidadesExternas.idEnProveedor, idEnProveedor)))
    .limit(1);

  return fila ?? null;
}

async function aprovisionarIdentidadNueva(idEnProveedor: string): Promise<IdentidadResuelta> {
  return db.transaction(async (tx) => {
    // Advisory lock por (proveedor, id_en_proveedor): serializa el
    // aprovisionamiento de la MISMA identidad externa entre requests
    // concurrentes. Dos logins casi simultáneos del mismo usuario nuevo
    // disparan dos transacciones; la segunda espera aquí en vez de crear
    // un segundo tenant. Mismo mecanismo de idempotencia que se exige
    // para los jobs de cierre de periodo (ver ADR-004: "advisory locks").
    // El hash de dos partes (namespace fijo + clave) evita colisionar con
    // otros advisory locks que el sistema pueda tomar más adelante.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('identidad_externa'), hashtext(${PROVEEDOR_SUPABASE} || ':' || ${idEnProveedor}))`
    );

    // Mientras esperábamos el lock, otra request pudo haber ganado la
    // carrera y ya haber terminado de aprovisionar esta misma identidad.
    const ganadaPorOtraRequest = await buscarIdentidadExistente(tx, idEnProveedor);
    if (ganadaPorOtraRequest) return ganadaPorOtraRequest;

    // El id se genera aquí, no con RETURNING sobre el INSERT: la política
    // de SELECT de "tenants" solo hace visible la fila cuyo id coincide
    // con app.tenant_id, y ese valor todavía no existe en esta transacción
    // (se fija dos líneas más abajo). `INSERT ... RETURNING` exige que la
    // fila insertada sea visible bajo una política de SELECT, así que
    // pedir RETURNING aquí fallaría con "new row violates row-level
    // security policy" aunque el WITH CHECK del INSERT sea `true`.
    const tenantId = randomUUID();
    await tx.insert(tenants).values({ id: tenantId });

    // A partir de aquí el resto de las tablas de dominio sí exigen que
    // app.tenant_id coincida (ver políticas RLS en db/schema).
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);

    const [usuario] = await tx.insert(usuarios).values({ tenantId }).returning({ id: usuarios.id });
    if (!usuario) throw new Error('No se pudo crear el usuario durante el aprovisionamiento');

    // La restricción única (proveedor, id_en_proveedor) en el schema
    // queda como respaldo a nivel de base de datos si este código se
    // llamara alguna vez sin pasar por el advisory lock de arriba.
    await tx.insert(identidadesExternas).values({
      usuarioId: usuario.id,
      tenantId,
      proveedor: PROVEEDOR_SUPABASE,
      idEnProveedor,
    });

    return { usuarioId: usuario.id, tenantId };
  });
}
