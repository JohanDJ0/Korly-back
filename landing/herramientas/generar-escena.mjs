/**
 * Genera, desde una sola fuente (landing/herramientas/escena/), todo lo que muestra la escena ilustrada:
 *   - frontend/src/components/escena-korly.tsx   (login de la app; JSX)
 *   - landing/public/index.html                  (héroe de korly.com.mx; entre los marcadores <!-- escena:… -->)
 *   - landing/public/styles.css y frontend/src/index.css (entre los comentarios "escena:inicio" y "escena:fin")
 *
 * Uso, desde la raíz del repositorio:  node landing/herramientas/generar-escena.mjs
 * Para cambiar el dibujo se edita ESTA fuente, nunca los archivos generados.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '../..');
const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');

const fuente = (nombre) => leer(resolve(aqui, 'escena', nombre)).replace(/<!--[\s\S]*?-->\s*/g, '').trim();
const escena = fuente('escena.fragmento.svg');
const arriba = fuente('saliente-arriba.fragmento.svg');
const abajo = fuente('saliente-abajo.fragmento.svg');
const css = leer(resolve(aqui, 'escena', 'escena.css')).trim();

/** Atributos SVG que cambian de nombre en JSX. */
const ATRIBUTOS = { class: 'className', 'text-anchor': 'textAnchor', 'font-size': 'fontSize', 'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap' };
function aJsx(svg) {
  return svg.replace(/ ([a-z-]+)=/g, (coincidencia, nombre) => ` ${ATRIBUTOS[nombre] ?? nombre}=`);
}
const sangrar = (texto, espacios) => texto.split('\n').map((l) => (l ? ' '.repeat(espacios) + l : l)).join('\n');

// ---------- TSX ----------
const tsx = `// ARCHIVO GENERADO por landing/herramientas/generar-escena.mjs — no editar a mano: cambia la fuente en landing/herramientas/escena/.
/* eslint-disable */

/** Escena principal (viewBox 0 0 800 800). Se pinta dos veces (capa de color y capa de contornos), por eso es un componente. */
export function EscenaKorly() {
  return (
    <>
${sangrar(aJsx(escena), 6)}
    </>
  );
}

/** Paloma con mochila propulsora que cruza la raya entre las dos mitades (viewBox 0 0 320 200). */
export function SalienteArriba() {
  return (
    <>
${sangrar(aJsx(arriba), 6)}
    </>
  );
}

/** Estrellas y una moneda que cruzan la raya entre las dos mitades, abajo (viewBox 0 0 320 170). */
export function SalienteAbajo() {
  return (
    <>
${sangrar(aJsx(abajo), 6)}
    </>
  );
}
`;
writeFileSync(resolve(raiz, 'frontend/src/components/escena-korly.tsx'), tsx);

// ---------- Marcadores ----------
function reemplazar(ruta, inicio, fin, contenido) {
  const texto = leer(ruta);
  const a = texto.indexOf(inicio);
  const b = texto.indexOf(fin);
  if (a === -1 || b === -1 || b < a) throw new Error(`Faltan los marcadores ${inicio} … ${fin} en ${ruta}`);
  writeFileSync(ruta, texto.slice(0, a + inicio.length) + '\n' + contenido + '\n' + texto.slice(b));
}

const html = resolve(raiz, 'landing/public/index.html');
reemplazar(html, '<!-- escena:inicio -->', '<!-- escena:fin -->', sangrar(escena, 10));
reemplazar(html, '<!-- saliente-arriba:inicio -->', '<!-- saliente-arriba:fin -->', sangrar(arriba, 6));
reemplazar(html, '<!-- saliente-abajo:inicio -->', '<!-- saliente-abajo:fin -->', sangrar(abajo, 6));

for (const archivo of ['landing/public/styles.css', 'frontend/src/index.css']) {
  reemplazar(resolve(raiz, archivo), '/* escena:inicio */', '/* escena:fin */', css);
}

console.log('Escena generada: TSX, index.html, styles.css e index.css.');
