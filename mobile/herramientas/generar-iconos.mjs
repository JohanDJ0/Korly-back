/**
 * Genera los íconos de la app Android a partir del logo de la web (frontend/public/logo/icon.svg), para que la app y la
 * web usen exactamente la misma "K". Se corre a mano cuando cambie el logo:
 *
 *   node mobile/herramientas/generar-iconos.mjs
 *
 * Usa el Playwright del frontend con el Chrome instalado (el mismo que las pruebas de punta a punta) para pasar el SVG a PNG.
 *
 *  - assets/icon.png                     1024 px: la K en su cuadro blanco sobre el verde oscuro (igual que el ícono de la PWA).
 *  - assets/android-icon-foreground.png  ícono adaptable: solo la K, transparente, dentro de la zona segura (el lanzador
 *                                        recorta en círculo, gota, etc.; lo que quede fuera del ~60 % central se puede cortar).
 *  - assets/android-icon-background.png  ícono adaptable: fondo blanco liso.
 *  - assets/android-icon-monochrome.png  ícono temático de Android 13+: la silueta de la K en un solo color (Android la tiñe).
 *  - assets/splash-icon.png              pantalla de carga: el cuadro blanco con la K, transparente alrededor.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..', '..');
const { chromium } = createRequire(resolve(raiz, 'frontend', 'package.json'))('playwright');

const svgOriginal = readFileSync(resolve(raiz, 'frontend', 'public', 'logo', 'icon.svg'), 'utf8').replace(/<\?xml[^>]*>\s*/, '');
// Sin el grupo "Capa_3" (el cuadro blanco redondeado) queda solo la K.
const svgSoloK = svgOriginal.replace(/<g id="Capa_3"[\s\S]*?<\/g>/, '');
// La K ocupa aprox. x 41–167, y 29–158 del viewBox de 203; este viewBox la centra y la deja en ~50 % del lienzo.
const VIEWBOX_K = '-25 -35.5 258 258';

const conViewBox = (svg, viewBox) => svg.replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`);
const conTamano = (svg) => svg.replace('<svg ', '<svg width="100%" height="100%" ');

const lienzo = (contenido, fondo = 'transparent') =>
  `<!doctype html><html><body style="margin:0;width:1024px;height:1024px;background:${fondo};display:flex;align-items:center;justify-content:center">${contenido}</body></html>`;

const ICONOS = {
  'icon.png': lienzo(`<div style="width:72%;height:72%">${conTamano(svgOriginal)}</div>`, '#122420'),
  'android-icon-foreground.png': lienzo(conTamano(conViewBox(svgSoloK, VIEWBOX_K))),
  'android-icon-background.png': lienzo('', '#ffffff'),
  // brightness(0) invert(1): toda la K en blanco; Android usa solo la forma y la tiñe con el color del tema.
  'android-icon-monochrome.png': lienzo(`<div style="width:100%;height:100%;filter:brightness(0) invert(1)">${conTamano(conViewBox(svgSoloK, VIEWBOX_K))}</div>`),
  'splash-icon.png': lienzo(`<div style="width:100%;height:100%">${conTamano(svgOriginal)}</div>`),
};

const navegador = await chromium.launch({ channel: 'chrome' });
const pagina = await navegador.newPage({ viewport: { width: 1024, height: 1024 } });
for (const [nombre, html] of Object.entries(ICONOS)) {
  await pagina.setContent(html);
  writeFileSync(resolve(aqui, '..', 'assets', nombre), await pagina.screenshot({ omitBackground: true }));
  console.log(`assets/${nombre}`);
}
await navegador.close();
