/**
 * `npm run respaldo` — copia de seguridad cifrada de la base de datos de producción (Supabase Free no hace respaldos).
 *
 *   npm run respaldo                       crea el respaldo, lo verifica y borra los de más de 30 días
 *   npm run respaldo -- --carpeta=D:\Respaldos
 *   npm run respaldo -- --solo-rotar       solo borra los de más de 30 días (no crea nada: ojo, puede dejarte sin ninguno)
 *
 * Qué hace, en orden:
 *  1. Se conecta con `DATABASE_URL` (solo LECTURA, una transacción consistente) y vuelca las tablas de `public` y las
 *     cuentas de Supabase Auth (módulo `modulos/respaldos/`).
 *  2. Lo cifra con la contraseña que escribes (AES-256-GCM; la contraseña no se guarda en ningún lado: si la pierdes, el
 *     respaldo no se puede abrir) y lo escribe en la carpeta de respaldos.
 *  3. LO VERIFICA: vuelve a leer el archivo, lo descifra y comprueba que cada tabla trae las filas que se volcaron.
 *     Un respaldo que no se pudo abrir de vuelta no cuenta: se borra y el comando falla.
 *  4. Borra los respaldos con más de 30 días (el aviso de privacidad promete conservarlos como máximo ese tiempo).
 *
 * La carpeta por omisión es `~/Respaldos-Korly`; se cambia con `--carpeta=` o `KORLY_RESPALDOS_DIR`. Nunca puede estar
 * dentro del repositorio (contienen datos financieros y correos de personas reales).
 */
import 'dotenv/config';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { conteosDe, parsearRespaldo } from '../src/modulos/respaldos/contenido.js';
import { cifrarRespaldo, descifrarRespaldo, validarClave } from '../src/modulos/respaldos/formato.js';
import { DIAS_DE_RETENCION, EXTENSION_RESPALDO, nombreDeRespaldo, respaldosVencidos } from '../src/modulos/respaldos/rotar.js';
import { volcarBaseDeDatos } from '../src/modulos/respaldos/volcar.js';
import { formatearBytes, obtenerClave } from './lib/entrada.js';

const RAIZ_DEL_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function leerArgumentos(argv: string[]) {
  const resultado = { carpeta: process.env.KORLY_RESPALDOS_DIR || join(homedir(), 'Respaldos-Korly'), soloRotar: false };
  for (const argumento of argv) {
    if (argumento === '--solo-rotar') resultado.soloRotar = true;
    else if (argumento.startsWith('--carpeta=') && argumento.length > 10) resultado.carpeta = argumento.slice(10);
    else {
      console.error(`Argumento no válido: ${argumento}\nUso: npm run respaldo -- [--carpeta=RUTA] [--solo-rotar]`);
      process.exit(1);
    }
  }
  return resultado;
}

function validarCarpeta(carpeta: string): string {
  const absoluta = resolve(carpeta);
  const dentro = relative(RAIZ_DEL_REPO, absoluta);
  if (dentro === '' || (!dentro.startsWith('..') && !isAbsolute(dentro))) {
    throw new Error(`La carpeta de respaldos (${absoluta}) está dentro del repositorio. Elige una fuera: los respaldos tienen datos de personas reales y no deben acabar en git.`);
  }
  return absoluta;
}

async function rotar(carpeta: string, ahora: Date): Promise<string[]> {
  const vencidos = respaldosVencidos(await readdir(carpeta), ahora);
  for (const nombre of vencidos) await rm(join(carpeta, nombre));
  return vencidos;
}

async function main() {
  const { carpeta: carpetaArgumento, soloRotar } = leerArgumentos(process.argv.slice(2));
  const carpeta = validarCarpeta(carpetaArgumento);
  const ahora = new Date();
  await mkdir(carpeta, { recursive: true });

  if (soloRotar) {
    const borrados = await rotar(carpeta, ahora);
    console.log(`Se borraron ${borrados.length} respaldos con más de ${DIAS_DE_RETENCION} días en ${carpeta}.`);
    return;
  }

  const urlBase = process.env.DATABASE_URL;
  if (!urlBase) throw new Error('Falta DATABASE_URL en backend/.env (la conexión de administración, la misma de las migraciones).');

  const clave = await obtenerClave({ confirmar: true });
  validarClave(clave);

  console.log(`Respaldo de Korly\n  Base:    ${new URL(urlBase).host} (solo lectura)\n  Carpeta: ${carpeta}\n`);

  const sql = postgres(urlBase, { max: 1, onnotice: () => {} });
  let archivo: string | undefined;
  try {
    process.stdout.write('1/4 Volcando la base de datos... ');
    const { contenido, resumen } = await volcarBaseDeDatos(sql, ahora);
    console.log(`${Object.keys(resumen.tablas).length} tablas, ${resumen.totalFilas} filas.`);

    process.stdout.write('2/4 Cifrando y guardando... ');
    const cifrado = await cifrarRespaldo(contenido, clave);
    const nombre = nombreDeRespaldo(ahora);
    archivo = join(carpeta, nombre);
    const parcial = `${archivo}.parcial`;
    await writeFile(parcial, cifrado, { mode: 0o600 });
    await rename(parcial, archivo);
    console.log(`${nombre} (${formatearBytes(cifrado.length)}).`);

    process.stdout.write('3/4 Verificando (abrir el archivo de vuelta y comparar)... ');
    const leido = parsearRespaldo(await descifrarRespaldo(await readFile(archivo), clave));
    const obtenidos = conteosDe(leido);
    for (const [tabla, filas] of Object.entries(resumen.tablas)) {
      if (obtenidos[tabla] !== filas) throw new Error(`La verificación falló: ${tabla} tiene ${obtenidos[tabla]} filas en el archivo y se volcaron ${filas}.`);
    }
    console.log('correcto.');

    process.stdout.write(`4/4 Rotación (más de ${DIAS_DE_RETENCION} días)... `);
    const borrados = await rotar(carpeta, ahora);
    const quedan = (await readdir(carpeta)).filter((n) => n.endsWith(EXTENSION_RESPALDO)).length;
    console.log(`${borrados.length} borrados, quedan ${quedan}.\n`);

    console.log('Listo. Tabla por tabla:');
    for (const [tabla, filas] of Object.entries(resumen.tablas)) console.log(`  ${tabla.padEnd(34)} ${filas}`);
    console.log(`\nGuarda la contraseña en tu gestor de contraseñas: sin ella este archivo no se puede abrir.\nProbar que se puede restaurar:  npm run respaldo:probar -- "${archivo}"`);
  } catch (error) {
    // Un respaldo que no se pudo verificar no sirve y no debe quedar ahí aparentando ser bueno.
    if (archivo) await rm(archivo, { force: true });
    throw error;
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(`\nNo se pudo hacer el respaldo: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
