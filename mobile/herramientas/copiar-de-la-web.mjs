/**
 * Mantiene la app al día con la web mientras no exista el paquete compartido (fase 3): copia tal cual los hooks de datos
 * (frontend/src/hooks) y los módulos puros que no dependen del navegador.
 *
 *   node mobile/herramientas/copiar-de-la-web.mjs            copia (sobrescribe las copias de la app)
 *   node mobile/herramientas/copiar-de-la-web.mjs --revisar  solo dice qué copias ya no coinciden con la web (sale con 1)
 *
 * Lo que NO se copia porque la app lo resuelve distinto: el captcha (WebView), el estado de la guía (su store y su hook), el ojito
 * (usa su propio almacenamiento), el pago con Stripe (no se ofrece dentro de la app, por las reglas de Google Play) e
 * importar CSV (pendiente en el teléfono).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..', '..');
const revisar = process.argv.includes('--revisar');

const EXCLUIR = new Set(['use-turnstile.ts', 'use-guia.ts', 'use-formatear-monto.ts', 'use-crear-checkout.ts', 'use-crear-portal.ts', 'use-importar.ts']);

/** [archivo de la web relativo a frontend/src, archivo de la app relativo a mobile/src, líneas que se agregan al principio] */
const pares = readdirSync(resolve(raiz, 'frontend/src/hooks'))
  .filter((f) => f.endsWith('.ts') && !f.includes('.test.') && !EXCLUIR.has(f))
  .map((f) => [`hooks/${f}`, `hooks/${f}`]);
pares.push(['lib/errores-auth.ts', 'lib/errores-auth.ts'], ['lib/fechas.ts', 'lib/fechas.ts'], ['lib/guia.ts', 'lib/guia.ts'], ['lib/fin-de-quincena.ts', 'lib/fin-de-quincena.ts']);
// Igual que en la web, salvo que aquí el `localStorage` lo instala expo-sqlite: esa línea se agrega al principio.
pares.push(['stores/guia-store.ts', 'stores/guia-store.ts', "import 'expo-sqlite/localStorage/install';\n\n"]);

const encabezado = (origen, agregado) => `// Copia de frontend/src/${origen} (${agregado ? 'más un import propio de la app al principio' : 'sin cambios'}; regenerar con mobile/herramientas/copiar-de-la-web.mjs). Fase 3: paquete compartido.\n`;

let distintas = 0;
for (const [origen, destino, agregado = ''] of pares) {
  const esperado = encabezado(origen, agregado) + agregado + readFileSync(resolve(raiz, 'frontend/src', origen), 'utf8').replace(/\r\n/g, '\n');
  const rutaDestino = resolve(raiz, 'mobile/src', destino);
  const actual = existsSync(rutaDestino) ? readFileSync(rutaDestino, 'utf8').replace(/\r\n/g, '\n') : null;
  if (actual === esperado) continue;
  distintas++;
  if (revisar) console.log(`distinto: mobile/src/${destino}`);
  else writeFileSync(rutaDestino, esperado);
}
// Las versiones del aviso y los términos no se copian (la app tiene su propio lib/aviso.ts), pero deben ser las mismas:
// si la web sube una versión y la app no, la app pediría aceptar algo distinto de lo publicado.
const version = (texto, nombre) => texto.match(new RegExp(`${nombre} = '([^']+)'`))?.[1];
const avisoWeb = readFileSync(resolve(raiz, 'frontend/src/lib/datos-responsable.ts'), 'utf8');
const avisoApp = readFileSync(resolve(raiz, 'mobile/src/lib/aviso.ts'), 'utf8');
for (const nombre of ['VERSION_AVISO_PRIVACIDAD', 'VERSION_TERMINOS']) {
  if (version(avisoWeb, nombre) !== version(avisoApp, nombre)) {
    distintas++;
    console.log(`distinto: ${nombre} (web ${version(avisoWeb, nombre)}, app ${version(avisoApp, nombre)}): actualiza mobile/src/lib/aviso.ts a mano`);
  }
}

console.log(revisar ? `${distintas} copias desactualizadas` : `${distintas} copias actualizadas`);
if (revisar && distintas > 0) process.exit(1);
