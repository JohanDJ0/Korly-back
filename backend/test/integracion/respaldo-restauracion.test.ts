import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { conteosDe, parsearRespaldo } from '../../src/modulos/respaldos/contenido.js';
import { cifrarRespaldo, descifrarRespaldo } from '../../src/modulos/respaldos/formato.js';
import { RestauracionError, restaurarRespaldo } from '../../src/modulos/respaldos/restaurar.js';
import { volcarBaseDeDatos } from '../../src/modulos/respaldos/volcar.js';
import { registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';

/**
 * Respaldo y restauración de punta a punta contra Postgres de verdad. Cada prueba restaura en una base desechable
 * creada aquí mismo (nunca sobre la base de las demás suites), así que se puede correr sin riesgo en cualquier orden.
 */

const urlAdmin = process.env.DATABASE_URL!;
const sufijo = randomUUID().slice(0, 8).replace(/-/g, '');
const clave = 'contraseña de prueba larga';

const urlDe = (base: string) => {
  const url = new URL(urlAdmin);
  url.pathname = `/${base}`;
  return url.toString();
};

let admin: Sql;
const creadas: string[] = [];

let contador = 0;

/** Base desechable en UTF-8 (como Supabase), aunque el Postgres de pruebas de Windows se cree en WIN1252. */
async function crearBase(etiqueta: string): Promise<Sql> {
  const nombre = `korly_respaldo_${etiqueta}_${sufijo}_${contador++}`;
  await admin.unsafe(`create database "${nombre}" template template0 encoding 'UTF8' locale 'C'`);
  creadas.push(nombre);
  return postgres(urlDe(nombre), { max: 1, onnotice: () => {} });
}

beforeAll(() => {
  admin = postgres(urlAdmin, { max: 1, onnotice: () => {} });
});

afterAll(async () => {
  for (const nombre of creadas) await admin.unsafe(`drop database if exists "${nombre}" with (force)`);
  await admin.end();
});

/** Una estructura chica que ejercita lo difícil: llaves foráneas, columnas generadas, nombres raros, tipos varios. */
const ESTRUCTURA_PUBLICA = `
  create table public.padres (id uuid primary key, nombre text not null, monto bigint not null, foto bytea, extra jsonb, creado timestamptz not null default now());
  create table public."hijos raros" ("Col ""Rara""" text not null, padre_id uuid not null references public.padres(id), etiquetas text[]);
`;

describe('respaldo y restauración (mecánica)', () => {
  async function origenConDatos(): Promise<Sql> {
    const origen = await crearBase('origen');
    await origen.unsafe(ESTRUCTURA_PUBLICA);
    await origen.unsafe(`
      create schema auth;
      create table auth.users (id uuid primary key, email text, email_minusculas text generated always as (lower(email)) stored, datos jsonb);
      create table auth.identities (id uuid primary key, user_id uuid references auth.users(id), proveedor text);
      create table auth.sessions (id uuid primary key); -- no debe respaldarse
      insert into auth.sessions values ('00000000-0000-0000-0000-0000000000aa');
      insert into auth.users values ('00000000-0000-0000-0000-000000000001', 'Ana@Ejemplo.com', default, '{"aviso":"2026-10-06"}');
      insert into auth.identities values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'email');
      insert into public.padres values
        ('00000000-0000-0000-0000-000000000001', E'Línea 1\\nLínea "2" — ☕', 9007199254740993, '\\xdeadbeef', '{"a":[1,2,{"b":null}]}', '2026-10-08 12:00:00+00'),
        ('00000000-0000-0000-0000-000000000002', 'otro', -5, null, null, '2026-10-09 12:00:00+00');
      insert into public."hijos raros" values ('x', '00000000-0000-0000-0000-000000000001', array['a','b c']), ('y', '00000000-0000-0000-0000-000000000002', null);
    `);
    return origen;
  }

  async function destinoVacio(): Promise<Sql> {
    const destino = await crearBase('destino');
    await destino.unsafe(ESTRUCTURA_PUBLICA);
    return destino;
  }

  const fotografia = async (sql: Sql) =>
    (
      await sql.unsafe<{ t: string }[]>(
        `select to_jsonb(p)::text as t from public.padres p union all select to_jsonb(h)::text from public."hijos raros" h
         union all select jsonb_build_object('id', u.id, 'email', u.email, 'datos', u.datos)::text from auth.users u order by 1`
      )
    ).map((f) => f.t);

  it('vuelca solo public y auth.users/identities; restaura igual (incluso el bigint que JavaScript redondearía)', async () => {
    const origen = await origenConDatos();
    const { contenido, resumen } = await volcarBaseDeDatos(origen);
    const respaldo = parsearRespaldo(await descifrarRespaldo(await cifrarRespaldo(contenido, clave), clave));

    expect(Object.keys(resumen.tablas).sort()).toEqual(['auth.identities', 'auth.users', 'public.hijos raros', 'public.padres']);
    expect(resumen.totalFilas).toBe(2 + 2 + 1 + 1);
    expect(contenido.toString()).not.toContain('sessions');
    expect(contenido.toString()).not.toContain('email_minusculas'); // columna generada: no se respalda

    const destino = await destinoVacio();
    const restauradas = await restaurarRespaldo(destino, respaldo, { crearTablasFaltantes: true });

    expect(restauradas).toEqual(conteosDe(respaldo));
    const [fila] = await destino.unsafe<{ monto: string; foto: string; nombre: string }[]>(
      `select monto::text, encode(foto, 'hex') as foto, nombre from public.padres where id = '00000000-0000-0000-0000-000000000001'`
    );
    expect(fila).toEqual({ monto: '9007199254740993', foto: 'deadbeef', nombre: 'Línea 1\nLínea "2" — ☕' });
    expect(await fotografia(destino)).toEqual(await fotografia(origen));
    await origen.end();
    await destino.end();
  });

  it('el volcado no escribe nada en la base de origen', async () => {
    const origen = await origenConDatos();
    const antes = await fotografia(origen);

    await volcarBaseDeDatos(origen);

    expect(await fotografia(origen)).toEqual(antes);
    await origen.end();
  });

  it('se niega a restaurar sobre una base que ya tiene datos, y no cambia nada', async () => {
    const origen = await origenConDatos();
    const respaldo = parsearRespaldo((await volcarBaseDeDatos(origen)).contenido);
    const destino = await destinoVacio();
    await destino.unsafe(`insert into public.padres values ('00000000-0000-0000-0000-0000000000ff', 'ya estaba', 1, null, null, now())`);

    await expect(restaurarRespaldo(destino, respaldo, { crearTablasFaltantes: true })).rejects.toThrow(/ya tiene datos/);

    const [{ n }] = (await destino.unsafe<{ n: number }[]>(`select count(*)::int as n from public.padres`)) as [{ n: number }];
    expect(n).toBe(1);
    await origen.end();
    await destino.end();
  });

  it('si el destino no tiene la tabla (migraciones sin aplicar) explica qué hacer; si falta una columna, también', async () => {
    const origen = await origenConDatos();
    const respaldo = parsearRespaldo((await volcarBaseDeDatos(origen)).contenido);

    const sinTablas = await crearBase('sintablas');
    await expect(restaurarRespaldo(sinTablas, respaldo)).rejects.toThrow(/no existe en la base destino.*migraciones/);

    const sinColumna = await crearBase('sincolumna');
    await sinColumna.unsafe(ESTRUCTURA_PUBLICA.replace(', extra jsonb', ''));
    await expect(restaurarRespaldo(sinColumna, respaldo, { crearTablasFaltantes: true })).rejects.toThrow(/no tiene las columnas extra/);
    await origen.end();
    await sinTablas.end();
    await sinColumna.end();
  });

  it('es todo o nada: si falla a la mitad no queda ninguna fila a medias', async () => {
    const origen = await origenConDatos();
    const respaldo = parsearRespaldo((await volcarBaseDeDatos(origen)).contenido);
    const destino = await destinoVacio();
    // Fuerza el fallo en la segunda tabla: una columna que el respaldo llena y el destino rechaza.
    await destino.unsafe(`alter table public."hijos raros" add constraint nunca check ("Col ""Rara""" = 'nunca')`);

    await expect(restaurarRespaldo(destino, respaldo, { crearTablasFaltantes: true })).rejects.toThrow();

    const [{ n }] = (await destino.unsafe<{ n: number }[]>(`select count(*)::int as n from public.padres`)) as [{ n: number }];
    expect(n).toBe(0);
    await origen.end();
    await destino.end();
  });

  it('un error de restauración es un RestauracionError (los scripts lo muestran sin trazas)', async () => {
    const origen = await origenConDatos();
    const respaldo = parsearRespaldo((await volcarBaseDeDatos(origen)).contenido);
    const destino = await crearBase('vacio');

    await expect(restaurarRespaldo(destino, respaldo)).rejects.toBeInstanceOf(RestauracionError);
    await origen.end();
    await destino.end();
  });
});

describe('respaldo y restauración con la estructura real de Korly (ledger)', () => {
  it('lo que la app guardó se restaura completo en una base nueva con las migraciones, y el ledger sigue balanceado', async () => {
    // Datos reales hechos con la propia app (en la base compartida de las pruebas).
    const { tenantId } = await resolverOcrearIdentidad(`test-respaldo-${randomUUID()}`);
    const hoy = new Date('2033-05-10T18:00:00Z');
    const periodo = await crearPeriodo(tenantId, 'quincenal', hoy);
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 1_000_000n, moneda: 'MXN', fechaEfectiva: '2033-05-10', fechaReferencia: hoy });
    await registrarGasto({ tenantId, periodoId: periodo.id, monto: 12_345n, moneda: 'MXN', fechaEfectiva: '2033-05-10', nota: 'tacos y café', fechaReferencia: hoy });

    const compartida = postgres(urlAdmin, { max: 1, onnotice: () => {} });
    const { contenido, resumen } = await volcarBaseDeDatos(compartida);
    await compartida.end();
    const respaldo = parsearRespaldo(await descifrarRespaldo(await cifrarRespaldo(contenido, clave), clave));

    expect(resumen.tablas['public.asientos']).toBeGreaterThanOrEqual(4); // ingreso + gasto, dos asientos cada uno
    expect(Object.keys(resumen.tablas)).toEqual(expect.arrayContaining(['public.tenants', 'public.gastos', 'public.ingresos', 'public.movimientos', 'public.periodos', 'public.cuentas']));

    const destino = await crearBase('real');
    await migrate(drizzle(destino), { migrationsFolder: resolve(__dirname, '../../drizzle') });
    const restauradas = await restaurarRespaldo(destino, respaldo);

    expect(restauradas).toEqual(conteosDe(respaldo));
    const [gasto] = await destino.unsafe<{ nota: string; monto: string }[]>(
      `select m.nota, (select max(a.monto_valor_minimo)::text from public.asientos a where a.movimiento_id = m.id) as monto
         from public.gastos g join public.movimientos m on m.id = g.movimiento_id where g.tenant_id = $1`,
      [tenantId]
    );
    expect(gasto).toEqual({ nota: 'tacos y café', monto: '12345' }); // la base compartida de pruebas puede no ser UTF-8, por eso sin emojis aquí
    const [{ desbalanceados }] = (await destino.unsafe<{ desbalanceados: number }[]>(
      `select count(*)::int as desbalanceados from (select 1 from public.asientos group by movimiento_id having sum(monto_valor_minimo) <> 0) x`
    )) as [{ desbalanceados: number }];
    expect(desbalanceados).toBe(0);

    // Los triggers del ledger siguen instalados después de restaurar: un asiento sigue sin poder modificarse.
    await expect(destino.unsafe(`update public.asientos set monto_valor_minimo = monto_valor_minimo + 1`)).rejects.toThrow(/inmutables/);
    await destino.end();
  }, 60000);
});
