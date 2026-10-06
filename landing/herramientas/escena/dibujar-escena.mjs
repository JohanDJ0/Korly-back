/**
 * Dibuja la escena ilustrada (isla isométrica con edificios, personajes y objetos) y escribe la fuente que luego reparte
 * generar-escena.mjs a la landing y a la app:
 *   escena.fragmento.svg, saliente-arriba.fragmento.svg, saliente-abajo.fragmento.svg y escena.css
 *
 * Uso, desde la raíz:  node landing/herramientas/escena/dibujar-escena.mjs && node landing/herramientas/generar-escena.mjs
 *
 * Todo es SVG con clases (`k-…`); los colores salen de la PALETA de abajo. La capa de contornos usa los mismos dibujos
 * con rellenos opacos del color del fondo, así cada figura tapa las líneas de lo que tiene detrás.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- paleta
const PALETA = {
  bg: '#14302a',
  d1: '#0a1613',
  d2: '#0f241f',
  d3: '#17342d',
  d4: '#1f4a40',
  d5: '#28594d',
  teal: '#167f6c',
  teal2: '#47a67c',
  teal3: '#2e9478',
  mint: '#9fe3cf',
  mint2: '#c9f2e5',
  glass: '#bfe9dd',
  gold: '#feb816',
  gold2: '#f89c1b',
  gold3: '#ffd66b',
  white: '#ffffff',
  cream: '#f3f0e6',
  gray: '#c9d3cf',
  gray2: '#93a39e',
  coral: '#ee6a52',
  coral2: '#c94a36',
  pink: '#f59bb4',
  pink2: '#d9708f',
  pink3: '#fcd0dc',
  skin: '#f0b38d',
  pig: '#aab9b4',
  pig2: '#7f948e',
  pig3: '#d9e2de',
  soft1: 'rgba(71, 166, 124, 0.2)',
  soft2: 'rgba(254, 184, 22, 0.13)',
  soft3: 'rgba(159, 227, 207, 0.1)',
};
const SUAVES = ['soft1', 'soft2', 'soft3'];

// ---------------------------------------------------------------- utilidades
const f = (n) => (Math.round(n * 10) / 10).toString();
const C = 0.8660254;
const S = 0.5;
const O = { x: 405, y: 335 };
/** Punto isométrico: x baja a la derecha, y baja a la izquierda, z sube. */
const p = (x, y, z) => [O.x + (x - y) * C, O.y + (x + y) * S - z];
const puntos = (lista) => lista.map(([a, b]) => `${f(a)},${f(b)}`).join(' ');
const poli = (clase, lista, extra = '') => `<polygon class="k-${clase}" points="${puntos(lista)}"${extra} />`;
/** Caja isométrica: [arriba, cara izquierda (plano y=y+d), cara derecha (plano x=x+w)]. */
function caja(x, y, z, w, d, h, [arriba, izq, der]) {
  return [
    poli(izq, [p(x, y + d, z + h), p(x + w, y + d, z + h), p(x + w, y + d, z), p(x, y + d, z)]),
    poli(der, [p(x + w, y, z + h), p(x + w, y + d, z + h), p(x + w, y + d, z), p(x + w, y, z)]),
    poli(arriba, [p(x, y, z + h), p(x + w, y, z + h), p(x + w, y + d, z + h), p(x, y + d, z + h)]),
  ].join('\n');
}
/** Rectángulo sobre la cara izquierda (plano y=Y). */
const enIzq = (Y, x0, x1, z0, z1, clase) => poli(clase, [p(x0, Y, z1), p(x1, Y, z1), p(x1, Y, z0), p(x0, Y, z0)]);
/** Rectángulo sobre la cara derecha (plano x=X). */
const enDer = (X, y0, y1, z0, z1, clase) => poli(clase, [p(X, y0, z1), p(X, y1, z1), p(X, y1, z0), p(X, y0, z0)]);
/** Transformación para dibujar "plano" sobre la cara derecha (u hacia la derecha, v hacia abajo, en unidades del mundo). */
const planoDer = (X, yIzq, zArriba) => {
  const [ox, oy] = p(X, yIzq, zArriba);
  return `matrix(${C} ${-S} 0 1 ${f(ox)} ${f(oy)})`;
};
const planoIzq = (Y, xIzq, zArriba) => {
  const [ox, oy] = p(xIzq, Y, zArriba);
  return `matrix(${C} ${S} 0 1 ${f(ox)} ${f(oy)})`;
};
const estrella = (clase, x, y, e = 1) =>
  `<path class="k-${clase}" transform="translate(${x} ${y}) scale(${e})" d="M0 -10 C1 -3 3 -1 10 0 C3 1 1 3 0 10 C-1 3 -3 1 -10 0 C-3 -1 -1 -3 0 -10Z" />`;

/** Ventana con marco, vidrio (encendido o apagado) y reflejo, sobre la cara izquierda. */
function ventanaIzq(Y, x0, x1, z0, z1, encendida) {
  return [
    enIzq(Y + 0.1, x0 - 2, x1 + 2, z0 - 2, z1 + 2, 'd2'),
    enIzq(Y + 0.2, x0, x1, z0, z1, encendida ? 'gold3' : 'd4'),
    encendida ? enIzq(Y + 0.3, x0, x1, z0, z0 + (z1 - z0) * 0.35, 'gold') : enIzq(Y + 0.3, x0, x0 + (x1 - x0) * 0.3, z0, z1, 'd5'),
  ].join('\n');
}
function ventanaDer(X, y0, y1, z0, z1, encendida) {
  return [
    enDer(X + 0.1, y0 - 2, y1 + 2, z0 - 2, z1 + 2, 'd1'),
    enDer(X + 0.2, y0, y1, z0, z1, encendida ? 'gold3' : 'd3'),
    encendida ? enDer(X + 0.3, y0, y1, z0, z0 + (z1 - z0) * 0.35, 'gold') : '',
  ].join('\n');
}

// ---------------------------------------------------------------- piezas
const partes = [];
const agrega = (...cosas) => partes.push(...cosas);

// Fondo, brillos y estrellas
agrega(
  `<rect class="k-bg" x="0" y="0" width="800" height="800" />`,
  `<circle class="k-soft1" cx="150" cy="170" r="200" />`,
  `<circle class="k-soft2" cx="680" cy="690" r="240" />`,
  `<circle class="k-soft3" cx="660" cy="140" r="140" />`,
  estrella('gold', 70, 60, 1.4),
  estrella('white', 290, 40),
  estrella('mint', 760, 300, 1.1),
  estrella('white', 40, 330, 0.9),
  estrella('gold', 420, 760, 1.2),
  estrella('white', 765, 560, 0.8),
  estrella('mint', 200, 760),
  estrella('gold', 560, 40, 0.7),
  ...[
    [190, 30, 'white', 2.5],
    [520, 90, 'mint', 3],
    [735, 210, 'white', 2.5],
    [25, 240, 'gold', 3.5],
    [140, 690, 'white', 2.5],
    [700, 760, 'mint', 3.5],
    [640, 470, 'white', 2],
    [95, 470, 'mint', 2.5],
    [330, 110, 'white', 2],
  ].map(([x, y, c, r]) => `<circle class="k-${c}" cx="${x}" cy="${y}" r="${r}" />`)
);

// Isla flotante: base, roca colgante y cubos que flotan debajo
const ISLA = { x: -60, y: -40, z: 0, w: 360, d: 330, h: 34 };
{
  const { x, y, w, d } = ISLA;
  const izqA = p(x, y + d, 0);
  const frente = p(x + w, y + d, 0);
  const derA = p(x + w, y, 0);
  agrega(
    // roca de abajo (dos caras, en zigzag)
    `<polygon class="k-d2" points="${puntos([izqA, frente, [frente[0] - 40, frente[1] + 70], [frente[0] - 110, frente[1] + 40], [izqA[0] + 90, izqA[1] + 60], [izqA[0] + 30, izqA[1] + 24]])}" />`,
    `<polygon class="k-d1" points="${puntos([frente, derA, [derA[0] - 26, derA[1] + 30], [derA[0] - 90, derA[1] + 66], [frente[0] + 30, frente[1] + 60], [frente[0] - 40, frente[1] + 70]])}" />`,
    `<polygon class="k-d3" points="${puntos([[frente[0] - 40, frente[1] + 70], [frente[0] - 10, frente[1] + 125], [frente[0] - 70, frente[1] + 66]])}" />`,
    caja(ISLA.x, ISLA.y, ISLA.z, ISLA.w, ISLA.d, ISLA.h, ['teal2', 'd4', 'd3']),
    // borde de pasto/orilla
    poli('teal3', [p(x, y + d, ISLA.h), p(x + w, y + d, ISLA.h), p(x + w, y + d, ISLA.h - 6), p(x, y + d, ISLA.h - 6)]),
    poli('teal', [p(x + w, y, ISLA.h), p(x + w, y + d, ISLA.h), p(x + w, y + d, ISLA.h - 6), p(x + w, y, ISLA.h - 6)]),
    // losetas del piso
    ...[0, 1, 2, 3, 4, 5].map((i) => `<polyline class="k-t-l" points="${puntos([p(x + 20 + i * 56, y + 10, ISLA.h), p(x + 20 + i * 56, y + d - 10, ISLA.h)])}" />`),
    // cubos flotando debajo
    `<g class="flota flota-b">${caja(40, 330, -120, 26, 26, 26, ['teal2', 'teal', 'd4'])}</g>`,
    `<g class="flota">${caja(250, 250, -150, 18, 18, 18, ['mint', 'teal2', 'teal'])}</g>`,
    `<g class="flota flota-c">${caja(-120, 230, -60, 22, 22, 22, ['gold3', 'gold', 'gold2'])}</g>`,
    `<g class="flota flota-b">${caja(330, -60, -40, 16, 16, 16, ['pink3', 'pink', 'pink2'])}</g>`
  );
}
const Z0 = ISLA.h;

// Torre principal (al fondo), con la pantalla de Korly en su cara derecha
const TA = { x: 20, y: -10, w: 150, d: 120, h: 250 };
{
  const { x, y, w, d, h } = TA;
  agrega(caja(x, y, Z0, w, d, h, ['mint', 'teal2', 'teal']));
  // franja de remate arriba
  agrega(
    poli('mint2', [p(x, y + d, Z0 + h), p(x + w, y + d, Z0 + h), p(x + w, y + d, Z0 + h - 10), p(x, y + d, Z0 + h - 10)]),
    poli('teal3', [p(x + w, y, Z0 + h), p(x + w, y + d, Z0 + h), p(x + w, y + d, Z0 + h - 10), p(x + w, y, Z0 + h - 10)])
  );
  // ventanas en la cara izquierda (4 x 6), algunas encendidas
  const encendidas = new Set(['0-1', '2-0', '1-3', '3-2', '0-4', '2-5', '3-5', '1-1']);
  for (let col = 0; col < 4; col++) {
    for (let fila = 0; fila < 6; fila++) {
      const x0 = x + 14 + col * 34;
      const z0 = Z0 + 26 + fila * 34;
      agrega(ventanaIzq(y + d, x0, x0 + 20, z0, z0 + 20, encendidas.has(`${col}-${fila}`)));
    }
  }
  // puerta
  agrega(enIzq(y + d + 0.2, x + 60, x + 86, Z0, Z0 + 34, 'd1'), enIzq(y + d + 0.3, x + 62, x + 84, Z0 + 2, Z0 + 32, 'd3'));
  // pantalla grande en la cara derecha
  const X = x + w;
  const pantalla = { y0: y + 6, y1: y + d - 6, z0: Z0 + 88, z1: Z0 + h - 18 };
  agrega(
    enDer(X + 0.2, pantalla.y0 - 6, pantalla.y1 + 6, pantalla.z0 - 6, pantalla.z1 + 6, 'd1'),
    enDer(X + 0.4, pantalla.y0, pantalla.y1, pantalla.z0, pantalla.z1, 'd3'),
    // soportes de la pantalla
    enDer(X + 0.1, pantalla.y0 + 14, pantalla.y0 + 20, Z0 + 40, pantalla.z0 - 6, 'd1'),
    enDer(X + 0.1, pantalla.y1 - 20, pantalla.y1 - 14, Z0 + 40, pantalla.z0 - 6, 'd1')
  );
  const ancho = pantalla.y1 - pantalla.y0;
  agrega(`<g transform="${planoDer(X + 0.5, pantalla.y1, pantalla.z1)}">
  <text class="k-txt-m" x="9" y="20" font-size="9">Puedes gastar hoy</text>
  <text class="k-txt" x="9" y="50" font-size="30">$475</text>
  <rect class="k-d4" x="9" y="58" width="${f(ancho - 18)}" height="6" rx="3" />
  <rect class="k-gold" x="9" y="58" width="${f((ancho - 18) * 0.36)}" height="6" rx="3" />
  <text class="k-txt-m" x="9" y="77" font-size="7">por día · 12 días más</text>
  <rect class="k-d2" x="9" y="86" width="${f(ancho - 18)}" height="17" rx="5" />
  <circle class="k-teal2" cx="18" cy="94.5" r="3.5" />
  <text class="k-txt-s" x="26" y="97.5" font-size="7.5">Súper</text>
  <text class="k-txt-s" x="${f(ancho - 13)}" y="97.5" font-size="7.5" text-anchor="end">−$280</text>
  <rect class="k-d2" x="9" y="107" width="${f(ancho - 18)}" height="17" rx="5" />
  <circle class="k-gold" cx="18" cy="115.5" r="3.5" />
  <text class="k-txt-s" x="26" y="118.5" font-size="7.5">Café</text>
  <text class="k-txt-s" x="${f(ancho - 13)}" y="118.5" font-size="7.5" text-anchor="end">−$55</text>
</g>`);
  // aire acondicionado y tubo en la cara derecha
  agrega(
    `<g>${caja(x + w, y + d - 34, Z0 + 40, 14, 26, 20, ['gray', 'gray2', 'gray2'])}</g>`,
    `<polyline class="k-t-d" points="${puntos([p(x + w + 0.5, y + 10, Z0 + h - 4), p(x + w + 0.5, y + 10, Z0 + 30)])}" />`
  );
}

// Azotea de la torre: antena, tanque de agua y la alcancía (cochinito) recibiendo monedas
{
  const zr = Z0 + TA.h;
  agrega(
    caja(TA.x + 14, TA.y + 12, zr, 30, 30, 34, ['gray', 'gray2', 'd5']),
    poli('d4', [p(TA.x + 14, TA.y + 12, zr + 34), p(TA.x + 44, TA.y + 12, zr + 34), p(TA.x + 44, TA.y + 42, zr + 34), p(TA.x + 14, TA.y + 42, zr + 34)]),
    `<polyline class="k-t-w" points="${puntos([p(TA.x + 120, TA.y + 20, zr), p(TA.x + 120, TA.y + 20, zr + 70)])}" />`,
    `<circle class="k-coral" cx="${f(p(TA.x + 120, TA.y + 20, zr + 72)[0])}" cy="${f(p(TA.x + 120, TA.y + 20, zr + 72)[1])}" r="4.5" />`
  );
  const [cx, cy] = p(TA.x + 88, TA.y + 72, zr);
  agrega(`<g transform="translate(${f(cx)} ${f(cy)})">
  <g class="brilla brilla-b">
    <circle class="k-gold" cx="6" cy="-112" r="9" /><circle class="k-gold2" cx="6" cy="-112" r="5.5" />
    <circle class="k-gold" cx="2" cy="-86" r="9" /><circle class="k-gold2" cx="2" cy="-86" r="5.5" />
  </g>
  <ellipse class="k-d2" cx="0" cy="2" rx="40" ry="10" />
  <rect class="k-pink2" x="-24" y="-16" width="11" height="18" rx="5" />
  <rect class="k-pink2" x="14" y="-16" width="11" height="18" rx="5" />
  <ellipse class="k-pink" cx="0" cy="-36" rx="40" ry="31" />
  <path class="k-pink2" d="M-38 -30 C-36 -10 -10 -4 10 -6 C28 -8 38 -18 40 -34 C38 -8 18 -4 0 -4 C-20 -4 -36 -12 -38 -30Z" />
  <ellipse class="k-pink3" cx="-14" cy="-54" rx="13" ry="6" transform="rotate(-18 -14 -54)" />
  <path class="k-pink2" d="M-20 -62 L-28 -80 L-8 -66Z" />
  <path class="k-pink2" d="M8 -66 L20 -82 L22 -62Z" />
  <rect class="k-d1" x="-10" y="-68" width="22" height="5" rx="2.5" />
  <ellipse class="k-pink2" cx="34" cy="-36" rx="12" ry="10" />
  <circle class="k-d2" cx="31" cy="-37" r="2.2" /><circle class="k-d2" cx="38" cy="-37" r="2.2" />
  <rect class="k-d1" x="10" y="-52" width="28" height="9" rx="4.5" />
  <path class="k-t-d" d="M10 -48 L-2 -50" />
  <circle class="k-pink3" cx="20" cy="-30" r="5" />
  <path class="k-t-p" d="M-40 -36 c-10 -4 -12 -14 -4 -16 c6 -1 6 8 -2 8" />
  <rect class="k-pink2" x="-30" y="-12" width="10" height="14" rx="4" />
  <rect class="k-pink2" x="20" y="-12" width="10" height="14" rx="4" />
</g>`);
}

// Edificio izquierdo (más oscuro), con letrero de gráfica en su cara derecha
const TB = { x: -50, y: 140, w: 90, d: 100, h: 160 };
{
  const { x, y, w, d, h } = TB;
  agrega(caja(x, y, Z0, w, d, h, ['d5', 'd4', 'd3']));
  agrega(poli('teal3', [p(x, y + d, Z0 + h), p(x + w, y + d, Z0 + h), p(x + w, y + d, Z0 + h - 8), p(x, y + d, Z0 + h - 8)]));
  const encendidas = new Set(['0-0', '1-2', '2-1', '0-3', '2-3']);
  for (let col = 0; col < 3; col++) {
    for (let fila = 0; fila < 4; fila++) {
      const x0 = x + 12 + col * 26;
      const z0 = Z0 + 22 + fila * 32;
      agrega(ventanaIzq(y + d, x0, x0 + 14, z0, z0 + 18, encendidas.has(`${col}-${fila}`)));
    }
  }
  // letrero con gráfica en zigzag (cara derecha)
  const X = x + w;
  agrega(enDer(X + 0.2, y + 14, y + d - 14, Z0 + 70, Z0 + 140, 'd1'), enDer(X + 0.4, y + 18, y + d - 18, Z0 + 74, Z0 + 136, 'd2'));
  agrega(`<g transform="${planoDer(X + 0.5, y + d - 18, Z0 + 136)}">
  <polyline class="k-t-m" points="6,48 16,38 24,44 34,24 42,32 52,14 58,20" />
  <polyline class="k-t-c" points="6,56 16,52 26,54 36,46 46,50 58,40" />
</g>`);
  // plantas en la azotea
  const [ax, ay] = p(x + 40, y + 50, Z0 + h);
  agrega(`<g transform="translate(${f(ax)} ${f(ay)})">
  <path class="k-teal2" d="M-6 -4 C-24 -20 -20 -40 -8 -46 C-4 -30 0 -18 -6 -4Z" />
  <path class="k-teal" d="M2 -4 C10 -26 26 -34 34 -30 C24 -18 14 -8 2 -4Z" />
  <path class="k-mint" d="M-2 -6 C-4 -30 4 -50 12 -54 C14 -36 8 -20 -2 -6Z" />
  <path class="k-coral" d="M-12 -2 L12 -2 L8 14 L-8 14Z" />
  <rect class="k-coral2" x="-13" y="-4" width="26" height="5" rx="2" />
</g>`);
}

// Escalera que sube a la azotea del edificio izquierdo, con un gato dormido en un escalón
{
  const pasos = 7;
  for (let i = 0; i < pasos; i++) {
    const x = 150 - i * 15;
    agrega(caja(x, 250, Z0, 15, 34, (i + 1) * 20, ['mint', 'teal2', 'teal']));
  }
  const [gx, gy] = p(112, 268, Z0 + 60);
  agrega(`<g transform="translate(${f(gx)} ${f(gy)})">
  <path class="k-gold2" d="M-28 0 C-30 -18 -10 -26 8 -24 C24 -22 30 -10 28 0Z" />
  <path class="k-gold" d="M-20 -4 C-20 -16 -4 -22 10 -20 C20 -18 24 -10 22 -4Z" />
  <circle class="k-gold2" cx="22" cy="-16" r="11" />
  <path class="k-gold2" d="M14 -24 L16 -34 L22 -26Z" /><path class="k-gold2" d="M26 -26 L32 -34 L32 -22Z" />
  <path class="k-t-d" d="M18 -16 q3 2 6 0 M24 -14 q2 2 4 0" />
  <path class="k-t-n" d="M-28 -2 C-40 -6 -40 -18 -30 -18" />
  <text class="k-txt-s" x="34" y="-34" font-size="9">z</text><text class="k-txt-s" x="42" y="-44" font-size="7">z</text>
</g>`);
}

// Kiosco rosa al frente a la derecha (la "tienda" de la quincena)
{
  const K = { x: 200, y: 170, w: 80, d: 70, h: 64 };
  agrega(caja(K.x, K.y, Z0, K.w, K.d, K.h, ['cream', 'pink', 'pink2']));
  // toldo a rayas
  for (let i = 0; i < 5; i++) {
    const x0 = K.x - 4 + i * 17.6;
    agrega(poli(i % 2 ? 'cream' : 'coral', [p(x0, K.y + K.d, Z0 + K.h + 2), p(x0 + 17.6, K.y + K.d, Z0 + K.h + 2), p(x0 + 17.6, K.y + K.d + 18, Z0 + K.h - 10), p(x0, K.y + K.d + 18, Z0 + K.h - 10)]));
  }
  agrega(enIzq(K.y + K.d + 0.2, K.x + 10, K.x + K.w - 10, Z0 + 10, Z0 + 40, 'd2'), enIzq(K.y + K.d + 0.3, K.x + 12, K.x + K.w - 12, Z0 + 12, Z0 + 38, 'gold3'));
  agrega(`<g transform="${planoIzq(K.y + K.d + 0.4, K.x + 30, Z0 + 34)}"><text class="k-txt-o" x="0" y="16" font-size="18">$</text></g>`);
  // letrero en la cara derecha
  agrega(enDer(K.x + K.w + 0.2, K.y + 12, K.y + K.d - 12, Z0 + 22, Z0 + 52, 'gold'));
  agrega(`<g transform="${planoDer(K.x + K.w + 0.4, K.y + K.d - 12, Z0 + 52)}"><text class="k-txt-o" x="23" y="21" font-size="15" text-anchor="middle">K</text></g>`);
}

// Farol en la orilla
{
  const [fx, fy] = p(-30, 270, Z0);
  agrega(`<g transform="translate(${f(fx)} ${f(fy)})">
  <rect class="k-d1" x="-2" y="-60" width="4" height="60" />
  <rect class="k-d1" x="-7" y="-66" width="14" height="8" rx="2" />
  <circle class="k-gold3" cx="0" cy="-70" r="7" /><circle class="k-gold" cx="0" cy="-70" r="3.5" />
</g>`);
}

// Islita flotante con la bandera de "meta" (abajo a la derecha)
{
  const dx = 620 - O.x;
  const dy = 600 - O.y;
  agrega(`<g class="flota flota-b"><g transform="translate(${f(dx)} ${f(dy)})">
  <polygon class="k-d2" points="${puntos([p(0, 64, 0), p(64, 64, 0), [p(64, 64, 0)[0] - 18, p(64, 64, 0)[1] + 46], [p(0, 64, 0)[0] + 20, p(0, 64, 0)[1] + 30]])}" />
  <polygon class="k-d1" points="${puntos([p(64, 64, 0), p(64, 0, 0), [p(64, 0, 0)[0] - 16, p(64, 0, 0)[1] + 26], [p(64, 64, 0)[0] - 18, p(64, 64, 0)[1] + 46]])}" />
  ${caja(0, 0, 0, 64, 64, 14, ['teal2', 'd4', 'd3'])}
  ${caja(34, 10, 14, 16, 16, 10, ['gray', 'gray2', 'd5'])}
  <polyline class="k-t-w" points="${puntos([p(18, 22, 14), p(18, 22, 104)])}" />
  <path class="k-gold" d="M${f(p(18, 22, 102)[0])} ${f(p(18, 22, 102)[1])} l40 8 l-8 12 l8 12 l-40 -6Z" />
  <path class="k-gold2" d="M${f(p(18, 22, 102)[0])} ${f(p(18, 22, 102)[1] + 20)} l40 6 l-8 -6 l8 -6 l-40 -2Z" opacity="0.7" />
  <text class="k-txt-o" x="${f(p(18, 22, 102)[0] + 16)}" y="${f(p(18, 22, 102)[1] + 15)}" font-size="9" text-anchor="middle">META</text>
  <circle class="k-gold3" cx="${f(p(18, 22, 106)[0])}" cy="${f(p(18, 22, 106)[1])}" r="3.5" />
  <g transform="translate(${f(p(40, 48, 14)[0])} ${f(p(40, 48, 14)[1])})">
    <path class="k-teal" d="M0 0 C-12 -6 -12 -22 0 -26 C12 -22 12 -6 0 0Z" />
    <path class="k-mint" d="M-2 -4 C-8 -10 -6 -20 0 -22 C0 -14 0 -8 -2 -4Z" />
  </g>
</g></g>`);
}

// Astronauta flotando, señalando la pantalla (arriba a la derecha)
agrega(`<g transform="translate(574 236) scale(0.76)">
<g class="flota">
  <!-- mochila propulsora y su llama -->
  <g class="llama-abajo">
    <path class="k-gold2" d="M30 176 C24 206 34 226 44 236 C52 218 56 200 50 176Z" />
    <path class="k-gold3" d="M34 178 C32 198 38 210 44 218 C48 204 50 192 46 178Z" />
  </g>
  <rect class="k-gray2" x="18" y="92" width="48" height="90" rx="14" />
  <rect class="k-gray" x="22" y="96" width="40" height="80" rx="11" />
  <rect class="k-d3" x="28" y="174" width="26" height="10" rx="4" />
  <rect class="k-coral" x="28" y="110" width="28" height="8" rx="4" />
  <!-- pierna trasera -->
  <path class="k-gray" d="M66 196 C62 220 66 238 74 250 L96 246 C92 230 92 214 96 196Z" />
  <path class="k-gold2" d="M70 246 C70 258 80 264 98 262 C104 262 106 254 102 246Z" />
  <rect class="k-d2" x="70" y="258" width="34" height="6" rx="3" />
  <!-- cuerpo -->
  <path class="k-white" d="M50 112 C46 92 62 78 92 78 C124 78 142 94 140 120 L136 196 C134 212 120 220 94 220 C66 220 54 210 54 192Z" />
  <path class="k-gray" d="M120 84 C136 92 142 106 140 122 L136 196 C134 210 124 218 106 220 C120 206 124 186 122 160 C120 132 124 106 120 84Z" />
  <rect class="k-gray" x="58" y="182" width="78" height="14" rx="6" />
  <rect class="k-gold" x="88" y="183" width="14" height="12" rx="3" />
  <!-- panel del pecho -->
  <rect class="k-d3" x="70" y="120" width="52" height="36" rx="8" />
  <rect class="k-d1" x="76" y="126" width="22" height="12" rx="3" />
  <polyline class="k-t-m2" points="78,134 82,130 86,134 90,128 96,132" />
  <circle class="k-coral" cx="106" cy="131" r="4.5" /><circle class="k-gold" cx="116" cy="131" r="4.5" />
  <rect class="k-teal2" x="76" y="144" width="40" height="6" rx="3" />
  <!-- manguera -->
  <path class="k-t-g" d="M60 150 C40 156 38 176 54 186" />
  <!-- pierna delantera -->
  <path class="k-white" d="M104 204 C110 228 124 244 140 254 L154 238 C140 228 132 214 130 198Z" />
  <path class="k-gray" d="M120 222 C128 234 138 244 148 248 L154 238 C142 230 134 220 130 206Z" />
  <path class="k-gold2" d="M138 252 C142 266 156 270 170 262 C176 258 174 248 166 242 L150 238Z" />
  <rect class="k-d2" x="146" y="258" width="28" height="6" rx="3" transform="rotate(-28 160 261)" />
  <!-- brazo de atrás -->
  <path class="k-gray" d="M58 120 C40 128 30 146 30 166 L46 170 C46 152 54 140 66 134Z" />
  <circle class="k-gold2" cx="37" cy="172" r="11" />
  <!-- brazo que señala -->
  <path class="k-white" d="M128 116 C150 120 164 134 168 150 L152 158 C148 146 140 138 126 136Z" />
  <path class="k-gray" d="M150 130 C160 138 166 146 168 150 L156 156 C154 148 150 140 144 134Z" />
  <path class="k-gold2" d="M150 156 C152 168 160 176 170 176 C176 176 180 170 178 164 L170 148Z" />
  <path class="k-gold2" d="M172 170 L196 190 C200 194 196 200 190 196 L168 178Z" />
  <!-- casco -->
  <circle class="k-white" cx="96" cy="54" r="50" />
  <path class="k-gray" d="M136 26 C152 46 150 78 128 96 C112 106 90 108 72 100 C102 102 132 86 136 56 C138 44 138 34 136 26Z" />
  <circle class="k-gray" cx="96" cy="54" r="40" />
  <circle class="k-d1" cx="100" cy="56" r="36" />
  <path class="k-teal" d="M72 74 C76 88 92 94 110 90 C124 86 132 74 134 62 C126 82 104 90 86 84 C78 82 74 78 72 74Z" />
  <path class="k-mint" d="M78 34 C86 26 100 24 110 28 C100 28 90 32 84 40Z" />
  <rect class="k-gold" x="108" y="62" width="14" height="8" rx="2" transform="rotate(-20 115 66)" />
  <circle class="k-white" cx="116" cy="40" r="4" /><circle class="k-white" cx="124" cy="48" r="2" />
  <circle class="k-coral" cx="96" cy="2" r="6" />
  <path class="k-t-w" d="M96 4 L96 -10" />
  <circle class="k-gold" cx="62" cy="56" r="7" />
  <text class="k-txt-o" x="62" y="60" font-size="9" text-anchor="middle">K</text>
</g>
</g>`);

// Monedas cayendo y flotando
agrega(
  `<g transform="translate(330 712)"><g class="brilla">
  <ellipse class="k-gold2" cx="0" cy="12" rx="38" ry="12" /><rect class="k-gold2" x="-38" y="0" width="76" height="12" /><ellipse class="k-gold" cx="0" cy="0" rx="38" ry="12" />
  <ellipse class="k-gold2" cx="0" cy="-16" rx="38" ry="12" /><rect class="k-gold2" x="-38" y="-16" width="76" height="16" /><ellipse class="k-gold" cx="0" cy="-16" rx="38" ry="12" />
  <ellipse class="k-gold3" cx="-10" cy="-19" rx="14" ry="4" />
</g></g>`,
  `<g transform="translate(200 175)"><g class="flota flota-c"><circle class="k-gold" r="17" /><circle class="k-gold2" r="11" /><text class="k-txt-o" y="5" font-size="15" text-anchor="middle">$</text></g></g>`,
  `<g transform="translate(745 150)"><g class="flota"><circle class="k-gold" r="13" /><circle class="k-gold2" r="8" /></g></g>`
);

// ---------------------------------------------------------------- figuras que se salen de la imagen
const pajaro = `<g transform="translate(190 104)">
  <g class="llama">
    <path class="k-coral" d="M-34 18 C-74 0 -118 14 -150 42 C-116 46 -82 58 -34 40Z" />
    <path class="k-gold2" d="M-34 22 C-66 10 -100 20 -126 40 C-98 42 -70 50 -34 36Z" />
    <path class="k-gold3" d="M-34 26 C-56 20 -80 28 -98 38 C-76 40 -56 44 -34 34Z" />
  </g>
  <circle class="k-cream" cx="-160" cy="52" r="10" opacity="0.85" /><circle class="k-cream" cx="-184" cy="60" r="7" opacity="0.7" /><circle class="k-cream" cx="-202" cy="64" r="4.5" opacity="0.55" />
  <path class="k-t-w" d="M-120 -6 L-80 -6 M-140 8 L-100 8" opacity="0.6" />
  <g class="flota">
    <!-- cola -->
    <path class="k-pig2" d="M-4 6 L-50 -12 L-44 6 L-60 16 L-42 22 L-54 34 L-4 28Z" />
    <path class="k-pig" d="M-6 10 L-40 0 L-34 12 L-48 20 L-6 24Z" />
    <!-- mochila -->
    <rect class="k-coral2" x="-30" y="-18" width="36" height="58" rx="12" />
    <rect class="k-coral" x="-26" y="-14" width="28" height="50" rx="10" />
    <path class="k-gold2" d="M-30 0 L-42 -8 L-42 10Z" /><path class="k-gold2" d="M-30 26 L-42 20 L-42 36Z" />
    <rect class="k-gray2" x="-22" y="34" width="20" height="12" rx="4" />
    <rect class="k-pink3" x="-20" y="-8" width="6" height="30" rx="3" />
    <!-- cuerpo -->
    <ellipse class="k-pig2" cx="32" cy="10" rx="58" ry="37" />
    <ellipse class="k-pig" cx="34" cy="6" rx="54" ry="33" />
    <path class="k-pig3" d="M50 30 C70 32 86 22 90 8 C88 26 72 40 50 38Z" />
    <!-- cinchas -->
    <path class="k-t-d" d="M-2 -18 C10 -6 10 20 -2 34" />
    <!-- ala en capas -->
    <path class="k-pig2" d="M-6 2 C10 -40 58 -54 92 -38 C80 -6 46 20 0 24Z" />
    <path class="k-pig" d="M2 0 C18 -30 56 -42 84 -32 C70 -10 42 10 4 16Z" />
    <path class="k-t-n" d="M20 -6 C34 -18 50 -24 66 -26 M24 4 C40 -6 56 -12 72 -14" />
    <!-- cuello tornasol y cabeza -->
    <path class="k-teal" d="M66 -14 C76 -26 92 -26 100 -14 C98 2 84 10 70 6Z" />
    <path class="k-pink" d="M74 -2 C82 -10 94 -10 100 -4 C96 6 84 10 76 6Z" />
    <circle class="k-pig" cx="92" cy="-24" r="22" />
    <circle class="k-pig2" cx="86" cy="-20" r="10" opacity="0.5" />
    <!-- goggles -->
    <path class="k-t-d" d="M72 -30 C82 -38 98 -38 110 -32" />
    <circle class="k-d1" cx="102" cy="-28" r="10" />
    <circle class="k-mint" cx="102" cy="-28" r="6.5" />
    <circle class="k-white" cx="99" cy="-31" r="2.2" />
    <!-- pico -->
    <path class="k-cream" d="M110 -24 C114 -27 118 -26 118 -23Z" />
    <path class="k-gold2" d="M112 -22 L136 -15 L112 -8Z" />
    <path class="k-gold" d="M112 -22 L136 -15 L112 -15Z" />
    <!-- patas -->
    <path class="k-t-c" d="M22 42 l-8 16 l-6 2 M22 42 l-8 16 l2 6 M40 44 l-4 16 l-6 2 M40 44 l-4 16 l3 6" />
  </g>
</g>
${estrella('gold', 52, 36, 1.1)}
${estrella('white', 296, 30, 0.85)}
<circle class="k-mint" cx="276" cy="170" r="4" />`;

const abajo = `<g transform="translate(110 82)"><g class="brilla">
  <circle class="k-gold" r="23" /><circle class="k-gold2" r="16" /><ellipse class="k-gold3" cx="-7" cy="-9" rx="8" ry="4" />
  <text class="k-txt-o" y="7" font-size="20" text-anchor="middle">$</text>
</g></g>
<g transform="translate(212 58)"><g class="flota flota-b"><polygon class="k-pink3" points="0,-16 14,-8 0,0 -14,-8" /><polygon class="k-pink" points="-14,-8 0,0 0,16 -14,8" /><polygon class="k-pink2" points="0,0 14,-8 14,8 0,16" /></g></g>
${estrella('gold', 190, 130, 1.4)}
${estrella('white', 250, 112, 0.9)}
${estrella('mint', 56, 140, 0.9)}
${estrella('gold', 296, 66, 0.8)}
<circle class="k-white" cx="160" cy="146" r="3" /><circle class="k-mint" cx="28" cy="40" r="4" /><circle class="k-gold" cx="232" cy="24" r="3" />`;

// ---------------------------------------------------------------- CSS
const nombres = Object.keys(PALETA);
const css = `/* Escena ilustrada (login de la app y héroe de korly.com.mx). ARCHIVO GENERADO por dibujar-escena.mjs. */
.arte {
  position: absolute;
  inset: 0;
  overflow: hidden;
  touch-action: pan-y;
  cursor: crosshair;
}
/* Grano fino encima de todo, como de ilustración impresa. */
.arte::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.32;
  mix-blend-mode: soft-light;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23g)'/%3E%3C/svg%3E");
}
.arte-capa {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.arte-color {
${nombres.map((n) => `  --c-${n}: ${PALETA[n]};`).join('\n')}
  --c-t-d: #0a1613;
  --c-t-c: #ee6a52;
  --c-t-w: #ffffff;
  --c-t-m: #feb816;
  --c-t-g: #93a39e;
  --c-t-p: #d9708f;
  --c-t-n: #7f948e;
  --c-t-l: rgba(10, 22, 19, 0.22);
  --c-txt: #ffffff;
  --c-txt-m: #8fbbae;
  --line: none;
  --sw: 0;
}
/* Capa de contornos: se ve solo por donde "pasó el cursor" (la máscara la escribe el script en --mascara). Los rellenos
   son opacos del color del fondo (no "none"): así cada figura tapa las líneas de lo que tiene detrás. */
.arte-contornos {
  --c-oculto: #0b1a16;
${nombres.map((n) => `  --c-${n}: ${n === 'bg' || SUAVES.includes(n) ? 'none' : 'var(--c-oculto)'};`).join('\n')}
  --c-t-d: var(--line);
  --c-t-c: var(--line);
  --c-t-w: var(--line);
  --c-t-m: var(--line);
  --c-t-g: var(--line);
  --c-t-p: var(--line);
  --c-t-n: var(--line);
  --c-t-l: none;
  --c-txt: none;
  --c-txt-m: none;
  --line: #7fe3cb;
  --sw: 1.8;
  background:
    radial-gradient(60% 50% at 30% 25%, rgba(47, 174, 147, 0.5), transparent 70%),
    radial-gradient(55% 45% at 75% 80%, rgba(254, 184, 22, 0.32), transparent 70%),
    #0a1613;
  -webkit-mask-image: var(--mascara, linear-gradient(transparent, transparent));
  mask-image: var(--mascara, linear-gradient(transparent, transparent));
  animation: korly-cambia-color 7s ease-in-out infinite alternate;
  pointer-events: none;
}
/* Las figuras que se salen de la imagen tienen su propia copia de contornos (misma máscara, recorrida a su posición):
   sin fondo, solo la figura en contornos. */
.arte-saliente.arte-contornos {
  background: none;
}
@keyframes korly-cambia-color {
  from {
    filter: hue-rotate(0deg);
  }
  to {
    filter: hue-rotate(-125deg);
  }
}
${nombres.map((n) => `:is(.arte, .arte-saliente) .k-${n}`).join(',\n')} {
  stroke: var(--line);
  stroke-width: var(--sw);
  stroke-linejoin: round;
}
${nombres.map((n) => `:is(.arte, .arte-saliente) .k-${n} {\n  fill: var(--c-${n});\n}`).join('\n')}
:is(.arte, .arte-saliente) [class^='k-t-'] {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
}
:is(.arte, .arte-saliente) .k-t-d {
  stroke: var(--c-t-d);
}
:is(.arte, .arte-saliente) .k-t-c {
  stroke: var(--c-t-c);
}
:is(.arte, .arte-saliente) .k-t-w {
  stroke: var(--c-t-w);
}
:is(.arte, .arte-saliente) .k-t-m {
  stroke: var(--c-t-m);
  stroke-width: 4;
}
:is(.arte, .arte-saliente) .k-t-m2 {
  fill: none;
  stroke: var(--c-t-m);
  stroke-width: 1.8;
  stroke-linejoin: round;
}
:is(.arte, .arte-saliente) .k-t-g {
  stroke: var(--c-t-g);
  stroke-width: 6;
}
:is(.arte, .arte-saliente) .k-t-p {
  stroke: var(--c-t-p);
}
:is(.arte, .arte-saliente) .k-t-n {
  stroke: var(--c-t-n);
  stroke-width: 2;
}
:is(.arte, .arte-saliente) .k-t-l {
  stroke: var(--c-t-l);
  stroke-width: 1.5;
}
.arte-contornos [class^='k-t-'] {
  stroke-width: 1.8;
}
:is(.arte, .arte-saliente) .k-txt,
:is(.arte, .arte-saliente) .k-txt-m,
:is(.arte, .arte-saliente) .k-txt-s,
:is(.arte, .arte-saliente) .k-txt-o {
  font-family: var(--font-display);
  stroke: var(--line);
  stroke-width: calc(var(--sw) * 0.35);
}
:is(.arte, .arte-saliente) .k-txt {
  fill: var(--c-txt);
  font-weight: 800;
}
:is(.arte, .arte-saliente) .k-txt-s {
  fill: var(--c-txt);
  font-weight: 600;
}
:is(.arte, .arte-saliente) .k-txt-m {
  fill: var(--c-txt-m);
  font-weight: 500;
}
:is(.arte, .arte-saliente) .k-txt-o {
  fill: #7a4a00;
  font-weight: 800;
}
.arte-contornos .k-txt-o {
  fill: none;
}

/* Movimiento suave de personajes y objetos (se apaga con "reducir movimiento"). */
:is(.arte, .arte-saliente) .flota {
  animation: korly-flota 6s ease-in-out infinite;
}
:is(.arte, .arte-saliente) .flota-b {
  animation-duration: 7.5s;
  animation-delay: -2s;
}
:is(.arte, .arte-saliente) .flota-c {
  animation-duration: 5s;
  animation-delay: -3.5s;
}
:is(.arte, .arte-saliente) .brilla {
  transform-box: fill-box;
  transform-origin: center;
  animation: korly-brilla 3.2s ease-in-out infinite;
}
:is(.arte, .arte-saliente) .brilla-b {
  animation-delay: -1.4s;
}
:is(.arte, .arte-saliente) .llama {
  transform-box: fill-box;
  transform-origin: right center;
  animation: korly-llama 0.35s ease-in-out infinite alternate;
}
:is(.arte, .arte-saliente) .llama-abajo {
  transform-box: fill-box;
  transform-origin: center top;
  animation: korly-llama-abajo 0.3s ease-in-out infinite alternate;
}
@keyframes korly-flota {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-12px) rotate(1.5deg);
  }
}
@keyframes korly-brilla {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}
@keyframes korly-llama {
  from {
    transform: scaleX(0.85);
  }
  to {
    transform: scaleX(1.12);
  }
}
@keyframes korly-llama-abajo {
  from {
    transform: scaleY(0.85);
  }
  to {
    transform: scaleY(1.15);
  }
}

@media (prefers-reduced-motion: reduce) {
  .arte-contornos {
    animation: none;
    display: none;
  }
  :is(.arte, .arte-saliente) :is(.flota, .flota-b, .flota-c, .brilla, .llama, .llama-abajo) {
    animation: none;
  }
}`;

// ---------------------------------------------------------------- escribir
const encabezado = (texto) => `<!-- ${texto} ARCHIVO GENERADO por dibujar-escena.mjs: no editar a mano. -->\n`;
writeFileSync(resolve(aqui, 'escena.fragmento.svg'), encabezado('Escena principal (viewBox 0 0 800 800).') + partes.join('\n') + '\n');
writeFileSync(resolve(aqui, 'saliente-arriba.fragmento.svg'), encabezado('Paloma con mochila propulsora (viewBox 0 0 320 200); mira a la derecha.') + pajaro + '\n');
writeFileSync(resolve(aqui, 'saliente-abajo.fragmento.svg'), encabezado('Moneda, cubo y estrellas que cruzan la raya, abajo (viewBox 0 0 320 170).') + abajo + '\n');
writeFileSync(resolve(aqui, 'escena.css'), css + '\n');
console.log(`Escena dibujada: ${partes.length} piezas.`);
