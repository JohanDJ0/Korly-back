import { sql } from 'drizzle-orm';
import { dbAdmin } from '../../shared/db-admin.js';
import type { DatosTenant } from './calcular-metricas.js';

/** Medianoche de México (UTC-6 fijo, ver shared/fechas.ts) de un día 'YYYY-MM-DD', como instante UTC. */
function inicioDelDiaEnMexico(dia: string): Date {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + 6 * 60 * 60 * 1000);
}

/**
 * Lee de la base lo mínimo para las métricas de producto: por usuario, solo
 * banderas, fechas y conteos. **No selecciona ningún dato personal ni
 * financiero** — ni correo, ni nombres, ni montos, ni notas, ni categorías,
 * y el reporte tampoco imprime ids. Usa `dbAdmin` (ver shared/db-admin.ts)
 * porque es un reporte del operador sobre todos los tenants; como el job de
 * recordatorios, es un script sin superficie HTTP.
 *
 * `desde` (inclusive) y `hasta` (exclusivo) son días de México y acotan la
 * cohorte por fecha de alta, para comparar tandas (p. ej. "solo quien entró
 * desde que arrancó el piloto", que deja fuera las cuentas de prueba).
 *
 * `soloConCuentaEnAuth` deja fuera los tenants sin cuenta en Supabase Auth: son filas huérfanas que deja borrar a un usuario
 * directo en el panel de Supabase (la purga completa solo corre desde "Eliminar mi cuenta") y que inflarían el conteo. Solo
 * tiene sentido contra la base real de Supabase; en una base sin el esquema `auth` falla con un mensaje claro.
 */
export async function leerDatosMetricas(
  opciones: { desde?: string; hasta?: string; ahora?: Date; soloConCuentaEnAuth?: boolean } = {}
): Promise<DatosTenant[]> {
  if (opciones.soloConCuentaEnAuth) {
    const [fila] = [...(await dbAdmin.execute(sql`select to_regclass('auth.users') is not null as hay`))] as { hay: boolean }[];
    if (!fila?.hay) throw new Error('Esta base no tiene Supabase Auth (auth.users): no se puede filtrar por cuentas existentes.');
  }
  const conCuentaEnAuth = opciones.soloConCuentaEnAuth
    ? sql`and exists (
        select 1 from usuarios u
        join identidades_externas ie on ie.usuario_id = u.id
        join auth.users au on au.id::text = ie.id_en_proveedor
        where u.tenant_id = t.id)`
    : sql``;
  const desde = opciones.desde ? inicioDelDiaEnMexico(opciones.desde).toISOString() : null;
  const hasta = opciones.hasta ? inicioDelDiaEnMexico(opciones.hasta).toISOString() : null;
  const hace7Dias = new Date((opciones.ahora ?? new Date()).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const tenants = await dbAdmin.execute(sql`
    select
      t.id,
      t.creado_en,
      t.plan,
      t.estado_suscripcion,
      t.recibir_recordatorios,
      (t.aviso_pro_solicitado_en is not null) as pidio_aviso_pro,
      exists (select 1 from periodos p where p.tenant_id = t.id) as tiene_periodo,
      exists (select 1 from ingresos i where i.tenant_id = t.id) as tiene_ingreso,
      (select count(*)::int from recordatorios_enviados r where r.tenant_id = t.id and r.creado_en >= ${hace7Dias}::timestamptz) as recordatorios_7d
    from tenants t
    where (${desde}::timestamptz is null or t.creado_en >= ${desde}::timestamptz)
      and (${hasta}::timestamptz is null or t.creado_en < ${hasta}::timestamptz)
      ${conCuentaEnAuth}
  `);

  // Capturas a mano: un gasto que NO salió de un recurrente, o un cargo de tarjeta.
  const capturas = await dbAdmin.execute(sql`
    select m.tenant_id, m.fecha_registro
    from movimientos m
    join gastos g on g.movimiento_id = m.id
    join tenants t on t.id = m.tenant_id
    where g.origen_recurrente_id is null
      and (${desde}::timestamptz is null or t.creado_en >= ${desde}::timestamptz)
      and (${hasta}::timestamptz is null or t.creado_en < ${hasta}::timestamptz)
    union all
    select m.tenant_id, m.fecha_registro
    from movimientos m
    join cargos_tarjeta c on c.movimiento_id = m.id
    join tenants t on t.id = m.tenant_id
    where (${desde}::timestamptz is null or t.creado_en >= ${desde}::timestamptz)
      and (${hasta}::timestamptz is null or t.creado_en < ${hasta}::timestamptz)
  `);

  const capturasPorTenant = new Map<string, Date[]>();
  for (const fila of capturas) {
    const id = String(fila['tenant_id']);
    const lista = capturasPorTenant.get(id) ?? [];
    lista.push(new Date(fila['fecha_registro'] as Date | string));
    capturasPorTenant.set(id, lista);
  }

  return [...tenants].map((fila) => ({
    altaEn: new Date(fila['creado_en'] as Date | string),
    plan: fila['plan'] as DatosTenant['plan'],
    estadoSuscripcion: (fila['estado_suscripcion'] as DatosTenant['estadoSuscripcion']) ?? null,
    recibirRecordatorios: Boolean(fila['recibir_recordatorios']),
    pidioAvisoPro: Boolean(fila['pidio_aviso_pro']),
    tienePeriodo: Boolean(fila['tiene_periodo']),
    tieneIngreso: Boolean(fila['tiene_ingreso']),
    capturas: capturasPorTenant.get(String(fila['id'])) ?? [],
    recordatoriosEnviadosUltimos7Dias: Number(fila['recordatorios_7d']),
  }));
}
