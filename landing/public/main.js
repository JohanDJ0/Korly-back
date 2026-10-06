/*
 * Página principal de Korly. Dos cosas, ambas opcionales (la página se lee igual sin JavaScript):
 *
 * 1. Dibujo interactivo del héroe. Dos capas con el mismo dibujo: una de color y otra de puros contornos, encima.
 *    La de contornos está oculta con una máscara hecha de manchas (gradientes radiales) que nacen donde pasa el
 *    cursor o el dedo, crecen y se desvanecen. Mientras nadie la toca, salen manchas solas de vez en cuando.
 *    Las figuras que se salen de la imagen (.arte-saliente) llevan su propia copia en contornos con la misma
 *    máscara, recorrida a su posición, para que también cambien al pasar el cursor.
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

  // Las manchas viven en coordenadas del héroe (que contiene al dibujo y a las figuras que se salen).
  const area = contenedor.closest('.hero') || contenedor;
  const salientes = Array.from(document.querySelectorAll('.arte-saliente.arte-color')).map((original) => {
    const copia = original.cloneNode(true);
    copia.classList.replace('arte-color', 'arte-contornos');
    original.after(copia);
    return copia;
  });
  const capas = [capa, ...salientes];

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
      capas.forEach((c) => c.style.setProperty('--mascara', 'linear-gradient(transparent, transparent)'));
      animando = false;
      return;
    }
    const base = area.getBoundingClientRect();
    for (const c of capas) {
      const r = c.getBoundingClientRect();
      const dx = r.left - base.left;
      const dy = r.top - base.top;
      // La paloma está volteada (scaleX(-1)): su máscara también se voltea.
      const espejo = getComputedStyle(c).transform.startsWith('matrix(-1');
      const gradientes = manchas.map((m) => {
        const t = (ahora - m.nacio) / VIDA_MS;
        const radio = Math.max(1, m.radio * suave(t / 0.4));
        const opacidad = (t < 0.45 ? 1 : 1 - suave((t - 0.45) / 0.55)).toFixed(2);
        return `radial-gradient(circle ${radio.toFixed(1)}px at ${(espejo ? r.width - (m.x - dx) : m.x - dx).toFixed(1)}px ${(m.y - dy).toFixed(1)}px, rgba(0,0,0,${opacidad}) 0%, rgba(0,0,0,${opacidad}) 62%, rgba(0,0,0,0) 100%)`;
      });
      c.style.setProperty('--mascara', gradientes.join(','));
    }
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
    const caja = area.getBoundingClientRect();
    return { x: evento.clientX - caja.left, y: evento.clientY - caja.top };
  }
  // Solo cuenta el cursor encima del dibujo o de alguna figura que se sale (no sobre el resto del texto).
  function encima(evento) {
    return [contenedor, ...salientes].some((el) => {
      const r = el.getBoundingClientRect();
      return evento.clientX >= r.left && evento.clientX <= r.right && evento.clientY >= r.top && evento.clientY <= r.bottom;
    });
  }

  area.addEventListener('pointermove', (evento) => {
    if (!encima(evento)) return;
    const { x, y } = posicion(evento);
    if (Math.hypot(x - ultimaX, y - ultimaY) < contenedor.clientWidth * 0.06) return;
    ultimaX = x;
    ultimaY = y;
    nacer(x, y);
  });
  area.addEventListener('pointerdown', (evento) => {
    if (!encima(evento)) return;
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
    // De lado a lado del dibujo y de las figuras que se salen, en coordenadas del héroe.
    const base = area.getBoundingClientRect();
    const rc = contenedor.getBoundingClientRect();
    const ox = rc.left - base.left;
    const oy = rc.top - base.top;
    const visibles = salientes.filter((el) => el.getBoundingClientRect().width > 0);
    const izquierda = Math.min(ox, ...visibles.map((el) => el.getBoundingClientRect().left - base.left));
    const derecha = Math.max(ox + ancho, ...visibles.map((el) => el.getBoundingClientRect().right - base.left));
    const tramo = derecha - izquierda;
    const desdeLaIzquierda = Math.random() < 0.5;
    const inicio = { x: izquierda + tramo * (desdeLaIzquierda ? 0.06 : 0.94), y: oy + alto * (0.1 + Math.random() * 0.8) };
    const fin = { x: izquierda + tramo * (desdeLaIzquierda ? 0.94 : 0.06), y: oy + alto * (0.1 + Math.random() * 0.8) };
    const curva = { x: izquierda + tramo * (0.3 + Math.random() * 0.4), y: oy + alto * Math.random() };
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
