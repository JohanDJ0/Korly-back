import { useEffect, useRef, type RefObject } from 'react';

import { EscenaKorly } from '@/components/escena-korly';

/**
 * Escena ilustrada que ocupa toda la mitad izquierda de las pantallas de acceso (la misma de korly.com.mx; la fuente
 * está en landing/herramientas/escena/ y se convierte a JSX con generar-escena.mjs). Dos capas de la misma escena: una de
 * color y otra de puros contornos encima. La de contornos está oculta con una máscara hecha de manchas (gradientes
 * radiales) que nacen donde pasa el cursor o el dedo, crecen y se desvanecen; mientras nadie la toca, un cursor invisible
 * recorre una curva de lado a lado y deja el mismo rastro. La máscara se escribe en la variable CSS `--mascara` de la
 * capa (ver `.arte-contornos` en index.css) y, con "reducir movimiento", la capa de contornos no se muestra.
 *
 * Las figuras que se salen de la imagen (`.arte-saliente`) también cambian: si se le pasa `zona` (el elemento que
 * contiene al dibujo y a esas figuras), el cursor se sigue en toda la zona y cada copia de contornos de una figura
 * (`.arte-saliente.arte-contornos`) recibe la misma máscara, recorrida a su posición.
 */

const VIDA_MS = 1300;
const MAX_MANCHAS = 36;
const MASCARA_VACIA = 'linear-gradient(transparent, transparent)';

interface Mancha {
  x: number;
  y: number;
  radio: number;
  nacio: number;
}

const suave = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * CSS de la máscara para un instante dado: una mancha por cada una viva, con su tamaño y opacidad de ese momento.
 * `dx`/`dy` es dónde empieza la capa dentro de la zona donde viven las manchas (para las figuras que se salen).
 */
export function mascaraDeManchas(manchas: readonly Mancha[], ahora: number, dx = 0, dy = 0): string {
  const vivas = manchas.filter((m) => ahora - m.nacio < VIDA_MS);
  if (vivas.length === 0) return MASCARA_VACIA;
  return vivas
    .map((m) => {
      const t = (ahora - m.nacio) / VIDA_MS;
      const radio = Math.max(1, m.radio * suave(t / 0.4));
      const opacidad = (t < 0.45 ? 1 : 1 - suave((t - 0.45) / 0.55)).toFixed(2);
      return `radial-gradient(circle ${radio.toFixed(1)}px at ${(m.x - dx).toFixed(1)}px ${(m.y - dy).toFixed(1)}px, rgba(0,0,0,${opacidad}) 0%, rgba(0,0,0,${opacidad}) 62%, rgba(0,0,0,0) 100%)`;
    })
    .join(',');
}

interface ArteInteractivoProps {
  /** Elemento que contiene al dibujo y a las figuras que se salen de él. Sin esto, solo el dibujo responde. */
  zona?: RefObject<HTMLElement | null>;
}

export function ArteInteractivo({ zona }: ArteInteractivoProps = {}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const capa = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const caja = contenedor.current;
    const contornos = capa.current;
    const sinMovimiento = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!caja || !contornos || sinMovimiento) return;
    // Las manchas viven en coordenadas de `area`; cada capa las ve recorridas a donde empieza.
    const area: HTMLElement = zona?.current ?? caja;
    const salientes = zona?.current ? Array.from(zona.current.querySelectorAll<SVGSVGElement>('.arte-saliente.arte-contornos')) : [];
    const capas: SVGSVGElement[] = [contornos, ...salientes];

    let manchas: Mancha[] = [];
    let animando = false;
    let ultimoToque = 0;
    let ultimaX = -999;
    let ultimaY = -999;
    let trazando = false;
    let visible = true;
    let cuadro = 0;
    const temporizadores: number[] = [];

    const pintar = (ahora: number) => {
      manchas = manchas.filter((m) => ahora - m.nacio < VIDA_MS);
      const base = area.getBoundingClientRect();
      for (const c of capas) {
        const r = c.getBoundingClientRect();
        c.style.setProperty('--mascara', mascaraDeManchas(manchas, ahora, r.left - base.left, r.top - base.top));
      }
      if (manchas.length === 0) {
        animando = false;
        return;
      }
      cuadro = requestAnimationFrame(pintar);
    };

    const nacer = (x: number, y: number, factor = 1) => {
      const radio = caja.clientWidth * (0.17 + Math.random() * 0.13) * factor;
      manchas.push({ x, y, radio, nacio: performance.now() });
      if (manchas.length > MAX_MANCHAS) manchas.shift();
      ultimoToque = performance.now();
      if (!animando) {
        animando = true;
        cuadro = requestAnimationFrame(pintar);
      }
    };

    const posicion = (evento: PointerEvent) => {
      const rect = area.getBoundingClientRect();
      return { x: evento.clientX - rect.left, y: evento.clientY - rect.top };
    };
    /** Solo cuenta el cursor encima del dibujo o de alguna figura que se sale (no en el resto de la zona). */
    const encima = (evento: PointerEvent) =>
      area === caja ||
      [caja, ...salientes].some((el) => {
        const r = el.getBoundingClientRect();
        return evento.clientX >= r.left && evento.clientX <= r.right && evento.clientY >= r.top && evento.clientY <= r.bottom;
      });

    const alMover = (evento: PointerEvent) => {
      if (!encima(evento)) return;
      const { x, y } = posicion(evento);
      if (Math.hypot(x - ultimaX, y - ultimaY) < caja.clientWidth * 0.06) return;
      ultimaX = x;
      ultimaY = y;
      nacer(x, y);
    };
    const alPresionar = (evento: PointerEvent) => {
      if (!encima(evento)) return;
      const { x, y } = posicion(evento);
      nacer(x, y, 1.5);
    };
    area.addEventListener('pointermove', alMover);
    area.addEventListener('pointerdown', alPresionar);

    const trazoAutomatico = (duracionMs: number) => {
      const ancho = caja.clientWidth;
      const alto = caja.clientHeight;
      // De lado a lado del dibujo y de las figuras que se salen, en coordenadas de la zona.
      const base = area.getBoundingClientRect();
      const rc = caja.getBoundingClientRect();
      const ox = area === caja ? 0 : rc.left - base.left;
      const oy = area === caja ? 0 : rc.top - base.top;
      const izquierda = Math.min(ox, ...salientes.map((el) => el.getBoundingClientRect().left - base.left));
      const derecha = Math.max(ox + ancho, ...salientes.map((el) => el.getBoundingClientRect().right - base.left));
      const tramo = derecha - izquierda;
      const desdeLaIzquierda = Math.random() < 0.5;
      const inicio = { x: izquierda + tramo * (desdeLaIzquierda ? 0.06 : 0.94), y: oy + alto * (0.1 + Math.random() * 0.8) };
      const fin = { x: izquierda + tramo * (desdeLaIzquierda ? 0.94 : 0.06), y: oy + alto * (0.1 + Math.random() * 0.8) };
      const curva = { x: izquierda + tramo * (0.3 + Math.random() * 0.4), y: oy + alto * Math.random() };
      const empezo = performance.now();
      let anterior: { x: number; y: number } | null = null;
      trazando = true;

      const paso = (ahora: number) => {
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
    };

    let observador: IntersectionObserver | undefined;
    if ('IntersectionObserver' in window) {
      observador = new IntersectionObserver(([entrada]) => {
        visible = entrada?.isIntersecting ?? true;
      });
      observador.observe(caja);
    }

    temporizadores.push(
      window.setInterval(() => {
        if (!visible || document.hidden || trazando || performance.now() - ultimoToque < 2200) return;
        trazoAutomatico(1100 + Math.random() * 600);
      }, 1000),
      window.setTimeout(() => trazoAutomatico(1500), 700)
    );

    return () => {
      area.removeEventListener('pointermove', alMover);
      area.removeEventListener('pointerdown', alPresionar);
      observador?.disconnect();
      cancelAnimationFrame(cuadro);
      temporizadores.forEach((id) => {
        window.clearInterval(id);
        window.clearTimeout(id);
      });
    };
  }, [zona]);

  return (
    <div ref={contenedor} className="arte" aria-hidden="true" data-testid="arte-interactivo">
      <svg className="arte-capa arte-color" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice" focusable="false">
        <EscenaKorly />
      </svg>
      <svg ref={capa} className="arte-capa arte-contornos" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice" focusable="false" data-testid="arte-contornos">
        <EscenaKorly />
      </svg>
    </div>
  );
}
