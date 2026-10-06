/*
 * Página principal de Korly. Dos cosas, ambas opcionales (la página se lee igual sin JavaScript):
 *
 * 1. Dibujo interactivo del héroe. Dos capas con el mismo dibujo: una de color y otra de puros contornos, encima.
 *    La de contornos está oculta con una máscara hecha de manchas (gradientes radiales) que nacen donde pasa el
 *    cursor o el dedo, crecen y se desvanecen. Mientras nadie la toca, salen manchas solas de vez en cuando.
 *    (Técnica de máscara sobre dos capas; el dibujo y el código son propios.)
 * 2. Las secciones aparecen poco a poco al llegar a ellas.
 */
(() => {
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Aparición al desplazarse ----------
  const secciones = document.querySelectorAll('.reveal');
  if (sinMovimiento || !('IntersectionObserver' in window)) {
    secciones.forEach((el) => el.classList.add('visible'));
  } else {
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            entrada.target.classList.add('visible');
            observador.unobserve(entrada.target);
          }
        }
      },
      { threshold: 0.12 }
    );
    secciones.forEach((el) => observador.observe(el));
  }

  // ---------- Dibujo interactivo ----------
  const contenedor = document.getElementById('art');
  const capa = document.getElementById('art-wire');
  const capaColor = document.getElementById('art-color');
  if (!contenedor || !capa || !capaColor || sinMovimiento) return;
  // La capa de contornos es una copia de la escena de color (misma escena, sin escribirla dos veces en el HTML).
  capa.innerHTML = capaColor.innerHTML;

  const VIDA_MS = 1300;
  const MAX_MANCHAS = 36;
  /** @type {{ x: number; y: number; radio: number; nacio: number }[]} */
  let manchas = [];
  let animando = false;
  let ultimoToque = 0;
  let ultimaX = -999;
  let ultimaY = -999;

  const suave = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

  function pintar(ahora) {
    manchas = manchas.filter((m) => ahora - m.nacio < VIDA_MS);
    if (manchas.length === 0) {
      capa.style.setProperty('--mascara', 'linear-gradient(transparent, transparent)');
      animando = false;
      return;
    }
    const capas = manchas.map((m) => {
      const t = (ahora - m.nacio) / VIDA_MS;
      const radio = Math.max(1, m.radio * suave(t / 0.4));
      const opacidad = t < 0.45 ? 1 : 1 - suave((t - 0.45) / 0.55);
      return `radial-gradient(circle ${radio.toFixed(1)}px at ${m.x.toFixed(1)}px ${m.y.toFixed(1)}px, rgba(0,0,0,${opacidad.toFixed(
        2
      )}) 0%, rgba(0,0,0,${opacidad.toFixed(2)}) 62%, rgba(0,0,0,0) 100%)`;
    });
    capa.style.setProperty('--mascara', capas.join(','));
    requestAnimationFrame(pintar);
  }

  function nacer(x, y, factor = 1) {
    const ancho = contenedor.clientWidth;
    const radio = ancho * (0.17 + Math.random() * 0.13) * factor;
    manchas.push({ x, y, radio, nacio: performance.now() });
    if (manchas.length > MAX_MANCHAS) manchas.shift();
    ultimoToque = performance.now();
    if (!animando) {
      animando = true;
      requestAnimationFrame(pintar);
    }
  }

  function posicion(evento) {
    const caja = contenedor.getBoundingClientRect();
    return { x: evento.clientX - caja.left, y: evento.clientY - caja.top };
  }

  contenedor.addEventListener('pointermove', (evento) => {
    const { x, y } = posicion(evento);
    if (Math.hypot(x - ultimaX, y - ultimaY) < contenedor.clientWidth * 0.06) return;
    ultimaX = x;
    ultimaY = y;
    nacer(x, y);
  });
  contenedor.addEventListener('pointerdown', (evento) => {
    const { x, y } = posicion(evento);
    nacer(x, y, 1.5);
  });

  // Cuando nadie la toca, el dibujo se "pinta solo": un cursor invisible recorre una curva de lado a lado y deja
  // el mismo rastro que dejaría el mouse (no una mancha suelta). Solo mientras el dibujo está a la vista.
  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entrada]) => {
      visible = entrada.isIntersecting;
    }).observe(contenedor);
  }

  let trazando = false;
  function trazoAutomatico(duracionMs) {
    const ancho = contenedor.clientWidth;
    const alto = contenedor.clientHeight;
    const desdeLaIzquierda = Math.random() < 0.5;
    const inicio = { x: ancho * (desdeLaIzquierda ? 0.08 : 0.92), y: alto * (0.15 + Math.random() * 0.7) };
    const fin = { x: ancho * (desdeLaIzquierda ? 0.92 : 0.08), y: alto * (0.15 + Math.random() * 0.7) };
    const curva = { x: ancho * (0.3 + Math.random() * 0.4), y: alto * Math.random() };
    const empezo = performance.now();
    let anterior = null;
    trazando = true;

    const paso = (ahora) => {
      const t = Math.min(1, (ahora - empezo) / duracionMs);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // arranca y termina suave
      const x = (1 - e) * (1 - e) * inicio.x + 2 * (1 - e) * e * curva.x + e * e * fin.x;
      const y = (1 - e) * (1 - e) * inicio.y + 2 * (1 - e) * e * curva.y + e * e * fin.y;
      // Misma separación entre manchas que con el mouse real, para que el trazo se vea igual.
      if (!anterior || Math.hypot(x - anterior.x, y - anterior.y) >= ancho * 0.055) {
        nacer(x, y, 0.85);
        anterior = { x, y };
      }
      if (t < 1) requestAnimationFrame(paso);
      else trazando = false;
    };
    requestAnimationFrame(paso);
  }

  setInterval(() => {
    if (!visible || document.hidden || trazando || performance.now() - ultimoToque < 2200) return;
    trazoAutomatico(1100 + Math.random() * 600);
  }, 1000);

  // Un primer trazo al cargar, para que se note que el dibujo responde.
  setTimeout(() => trazoAutomatico(1500), 700);
})();
