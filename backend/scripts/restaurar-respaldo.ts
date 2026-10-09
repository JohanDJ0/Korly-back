/**
 * `npm run respaldo:restaurar -- <archivo.korlybak> --destino=<URL de Postgres>` — restaura un respaldo en una base de
 * datos NUEVA (p. ej. un proyecto de Supabase recién creado) que ya tenga la estructura aplicada (`npm run db:migrate`
 * contra esa base) y esté vacía.
 *
 * Por seguridad:
 *  - El destino SIEMPRE se escribe a mano: este script nunca usa por omisión la `DATABASE_URL` del `.env` (que apunta
 *    a producción) para escribir.
 *  - Si el destino resulta ser la misma base que `DATABASE_URL`, pide una confirmación extra.
 *  - Una tabla con datos o una columna que falta detienen todo; es una sola transacción: o queda todo o no queda nada.
 *  - Antes de tocar nada, escribe el nombre del servidor y la base para confirmar.
 *
 * Qué NO hace: no restaura sesiones de Supabase ni su configuración (correo, plantillas, URLs), ni Stripe, ni las
 * variables de Railway/Vercel. Las cuentas de `auth.users` se cargan directo en la base; que Supabase las acepte en un
 * proyecto nuevo no está probado contra Supabase real (ver README, sección de respaldos).
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { conteosDe, parsearRespaldo } from '../src/modulos/respaldos/contenido.js';
import { descifrarRespaldo } from '../src/modulos/respaldos/formato.js';
import { RestauracionError, restaurarRespaldo } from '../src/modulos/respaldos/restaurar.js';
import { obtenerClave, preguntar } from './lib/entrada.js';

const identidadDe = (url: string) => {
  const u = new URL(url);
  return `${u.host}${u.pathname}`;
};

async function main() {
  const argumentos = process.argv.slice(2);
  const ruta = argumentos.find((a) => !a.startsWith('--'));
  const destinoUrl = argumentos.find((a) => a.startsWith('--destino='))?.slice(10);
  if (!ruta || !destinoUrl) {
    console.error('Uso: npm run respaldo:restaurar -- <archivo.korlybak> --destino=postgresql://...');
    process.exit(1);
  }

  const clave = await obtenerClave({ confirmar: false });
  const respaldo = parsearRespaldo(await descifrarRespaldo(await readFile(resolve(ruta)), clave));
  const conteos = conteosDe(respaldo);

  console.log(`\nRespaldo del ${respaldo.manifiesto.creado_en}: ${Object.keys(conteos).length} tablas, ${Object.values(conteos).reduce((a, b) => a + b, 0)} filas.`);
  const destino = identidadDe(destinoUrl);
  console.log(`Destino: ${destino}`);
  if (process.env.DATABASE_URL && identidadDe(process.env.DATABASE_URL) === destino) {
    console.log('\n⚠  Ese destino es la MISMA base que DATABASE_URL (producción).');
    if ((await preguntar('Escribe RESTAURAR EN PRODUCCION para continuar: ')) !== 'RESTAURAR EN PRODUCCION') {
      console.log('No se hizo nada.');
      return;
    }
  }
  if ((await preguntar(`Para confirmar escribe el servidor y la base del destino (${destino}): `)) !== destino) {
    console.log('No coincide. No se hizo nada.');
    return;
  }

  const sql = postgres(destinoUrl, { max: 1, onnotice: () => {} });
  try {
    const restauradas = await restaurarRespaldo(sql, respaldo);
    console.log('\nRestauración completa:');
    for (const [tabla, filas] of Object.entries(restauradas)) console.log(`  ${tabla.padEnd(34)} ${filas}`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  const esperado = error instanceof RestauracionError || (error instanceof Error && error.name === 'RespaldoInvalidoError');
  console.error(`\nNo se restauró nada: ${error instanceof Error ? error.message : error}`);
  if (!esperado && error instanceof Error && error.stack) console.error(error.stack);
  process.exit(1);
});
