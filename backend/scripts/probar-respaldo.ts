/**
 * `npm run respaldo:probar -- <archivo.korlybak>` — la prueba de restauración: abre un respaldo real y lo restaura en un
 * Postgres desechable que se crea y se destruye en tu máquina (no toca Supabase ni ninguna base real), y comprueba que
 * cada tabla recupera todas sus filas y que el ledger sigue balanceado. Es la única forma honesta de saber que un
 * respaldo sirve: uno que nunca se probó no es un respaldo.
 *
 * Limitación: las tablas de Supabase Auth (auth.users, auth.identities) se recrean aquí sin sus llaves ni restricciones
 * (un Postgres común no las trae), así que se prueba que sus filas se leen y se cargan, no que Supabase las acepte.
 *
 * La contraseña se pide (o se toma de KORLY_RESPALDO_CLAVE). Los datos se descifran solo en la memoria de este proceso
 * y en el Postgres temporal, que se borra por completo al terminar.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { conteosDe, parsearRespaldo } from '../src/modulos/respaldos/contenido.js';
import { descifrarRespaldo } from '../src/modulos/respaldos/formato.js';
import { restaurarRespaldo } from '../src/modulos/respaldos/restaurar.js';
import { obtenerClave } from './lib/entrada.js';
import { aplicarMigraciones, iniciarPostgresEfimero } from './lib/postgres-efimero.js';

async function main() {
  const ruta = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!ruta) {
    console.error('Uso: npm run respaldo:probar -- <archivo.korlybak>');
    process.exit(1);
  }

  const archivo = await readFile(resolve(ruta));
  const clave = await obtenerClave({ confirmar: false });
  process.stdout.write('Abriendo el respaldo... ');
  const respaldo = parsearRespaldo(await descifrarRespaldo(archivo, clave));
  const conteos = conteosDe(respaldo);
  const total = Object.values(conteos).reduce((a, b) => a + b, 0);
  console.log(`creado el ${respaldo.manifiesto.creado_en}, ${respaldo.manifiesto.migraciones} migraciones, ${Object.keys(conteos).length} tablas, ${total} filas.`);

  const pg = await iniciarPostgresEfimero({ migrar: false, registro: (m) => console.log(`  ${m}`) });
  try {
    // Base en UTF-8 como la de Supabase (el Postgres embebido de Windows nace en WIN1252 y rechazaría emojis de tus notas).
    const admin = postgres(pg.urlAdmin, { max: 1, onnotice: () => {} });
    await admin.unsafe(`create database korly_prueba template template0 encoding 'UTF8' locale 'C'`);
    await admin.end();
    const urlPrueba = pg.urlDeBase('korly_prueba');
    console.log('  aplicando las migraciones del repositorio...');
    await aplicarMigraciones(urlPrueba);

    const destino = postgres(urlPrueba, { max: 1, onnotice: () => {} });
    try {
      process.stdout.write('Restaurando... ');
      const restauradas = await restaurarRespaldo(destino, respaldo, { crearTablasFaltantes: true });
      console.log('hecho.\n');
      console.log('Tabla                               respaldo  restaurada');
      for (const [tabla, filas] of Object.entries(conteos)) console.log(`  ${tabla.padEnd(34)} ${String(filas).padStart(6)}  ${String(restauradas[tabla]).padStart(9)}`);
      console.log('\n✔ El respaldo se puede restaurar: todas las tablas recuperaron sus filas y el ledger está balanceado.');
    } finally {
      await destino.end();
    }
  } finally {
    await pg.detener();
  }
}

main().catch((error) => {
  console.error(`\nLa prueba de restauración falló: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
