import type { Sql } from 'postgres';
import { VERSION_CONTENIDO, nombreCompleto, type DefinicionTabla, type ManifiestoRespaldo } from './contenido.js';

/**
 * Volcado de la base de datos a texto (formato en `contenido.ts`). Se hace SOLO LECTURA y dentro de una transacción
 * `repeatable read`, así que todas las tablas salen del mismo instante aunque la app siga recibiendo gastos mientras
 * corre: un respaldo que mezcla tablas de momentos distintos podría tener un movimiento sin sus asientos.
 *
 * Qué entra:
 *  - Todas las tablas del esquema `public` (se descubren solas: una tabla nueva queda respaldada sin tocar este archivo).
 *  - `auth.users` y `auth.identities` de Supabase Auth, si existen: ahí viven los correos y los hashes de contraseña;
 *    sin ellos, recuperar la base dejaría a los usuarios sin poder entrar.
 *  - Nada más (ni sesiones ni tokens de Supabase, ni el esquema: la estructura sale de las migraciones del repositorio).
 *
 * Las columnas generadas se omiten (la base las recalcula al restaurar).
 */

export interface ResumenRespaldo {
  tablas: Record<string, number>;
  totalFilas: number;
}

const TABLAS_AUTH = ['users', 'identities'];
const FILAS_POR_BLOQUE = 1000;

const ident = (nombre: string) => `"${nombre.replace(/"/g, '""')}"`;
export const referenciaDe = (tabla: { esquema: string; nombre: string }) => `${ident(tabla.esquema)}.${ident(tabla.nombre)}`;

export async function volcarBaseDeDatos(sql: Sql, ahora = new Date()): Promise<{ contenido: Buffer; resumen: ResumenRespaldo }> {
  const lineas: string[] = [];
  const conteos: Record<string, number> = {};

  await sql.begin('isolation level repeatable read read only', async (tx) => {
    const [filaServidor] = await tx.unsafe<{ servidor: string }[]>('select version() as servidor');
    const servidor = filaServidor?.servidor ?? '';

    let migraciones = 0;
    let ultimaMigracion: string | null = null;
    const [filaExiste] = await tx.unsafe<{ existe: boolean }[]>(`select to_regclass('drizzle.__drizzle_migrations') is not null as existe`);
    if (filaExiste?.existe) {
      const [fila] = await tx.unsafe<{ n: number; ultima: string | null }[]>(
        'select count(*)::int as n, (array_agg(hash order by id desc))[1] as ultima from drizzle.__drizzle_migrations'
      );
      migraciones = fila?.n ?? 0;
      ultimaMigracion = fila?.ultima ?? null;
    }

    const manifiesto: ManifiestoRespaldo = {
      korly_respaldo: VERSION_CONTENIDO,
      creado_en: ahora.toISOString(),
      servidor,
      migraciones,
      ultima_migracion: ultimaMigracion,
    };
    lineas.push(`M${JSON.stringify(manifiesto)}`);

    const tablas = await tx.unsafe<{ esquema: string; nombre: string }[]>(
      `select n.nspname as esquema, c.relname as nombre
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p')
          and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = any($1::text[])))
        order by n.nspname, c.relname`,
      [TABLAS_AUTH]
    );

    for (const tabla of tablas) {
      const referencia = referenciaDe(tabla);
      const columnas = await tx.unsafe<{ nombre: string; tipo: string }[]>(
        `select a.attname as nombre, format_type(a.atttypid, a.atttypmod) as tipo
           from pg_attribute a
          where a.attrelid = $1::text::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
          order by a.attnum`,
        [referencia]
      );
      const definicion: DefinicionTabla = { ...tabla, columnas };
      lineas.push(`T${JSON.stringify(definicion)}`);

      const lista = columnas.map((c) => ident(c.nombre)).join(', ');
      const cursor = tx.unsafe<{ fila: string }[]>(`select to_jsonb(t)::text as fila from (select ${lista} from ${referencia}) t`).cursor(FILAS_POR_BLOQUE);
      let filas = 0;
      for await (const bloque of cursor) {
        for (const { fila } of bloque) {
          lineas.push(`R${fila}`);
          filas++;
        }
      }
      conteos[nombreCompleto(tabla)] = filas;
    }

    lineas.push(`F${JSON.stringify({ tablas: conteos })}`);
  });

  return {
    contenido: Buffer.from(`${lineas.join('\n')}\n`, 'utf8'),
    resumen: { tablas: conteos, totalFilas: Object.values(conteos).reduce((a, b) => a + b, 0) },
  };
}
