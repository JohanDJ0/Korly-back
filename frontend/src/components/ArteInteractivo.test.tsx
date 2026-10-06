import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ArteInteractivo, mascaraDeManchas } from '@/components/ArteInteractivo';

const MASCARA_VACIA = 'linear-gradient(transparent, transparent)';

describe('mascaraDeManchas', () => {
  it('sin manchas vivas la máscara no deja ver nada', () => {
    expect(mascaraDeManchas([], 1000)).toBe(MASCARA_VACIA);
    expect(mascaraDeManchas([{ x: 10, y: 10, radio: 50, nacio: 0 }], 5000)).toBe(MASCARA_VACIA); // ya pasó su vida
  });

  it('una mancha recién nacida es opaca y chica; una a media vida es opaca y grande; una por morir casi no se ve', () => {
    const nacida = mascaraDeManchas([{ x: 100, y: 80, radio: 120, nacio: 1000 }], 1000);
    const enPlenitud = mascaraDeManchas([{ x: 100, y: 80, radio: 120, nacio: 1000 }], 1000 + 520);
    const muriendo = mascaraDeManchas([{ x: 100, y: 80, radio: 120, nacio: 1000 }], 1000 + 1250);

    expect(nacida).toContain('circle 1.0px at 100.0px 80.0px');
    expect(enPlenitud).toContain('circle 120.0px at 100.0px 80.0px');
    expect(enPlenitud).toContain('rgba(0,0,0,1.00)');
    expect(muriendo).toMatch(/rgba\(0,0,0,0\.0\d\)/);
  });

  it('con varias manchas junta un gradiente por cada una: así se ve un trazo y no un punto', () => {
    const trazo = [0, 1, 2, 3, 4].map((i) => ({ x: 20 + i * 40, y: 100, radio: 60, nacio: 1000 + i * 50 }));

    const mascara = mascaraDeManchas(trazo, 1300);

    expect(mascara.match(/radial-gradient/g)).toHaveLength(5);
  });
});

describe('ArteInteractivo', () => {
  beforeEach(() => {
    // Reloj falso para el tiempo, los temporizadores y los cuadros de animación: la animación avanza solo cuando la prueba lo manda.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('es decorativo: oculto para lectores de pantalla, con las dos capas del mismo dibujo', () => {
    render(<ArteInteractivo />);

    const arte = screen.getByTestId('arte-interactivo');
    expect(arte).toHaveAttribute('aria-hidden', 'true');
    expect(arte.querySelectorAll('svg.arte-capa')).toHaveLength(2);
    expect(arte.querySelectorAll('.k-txt').length).toBeGreaterThanOrEqual(8); // la escena está dos veces
  });

  it('al pasar el cursor, la capa de contornos recibe una máscara con manchas', () => {
    render(<ArteInteractivo />);
    const arte = screen.getByTestId('arte-interactivo');
    const contornos = screen.getByTestId('arte-contornos');
    arte.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 430, right: 400, bottom: 430, x: 0, y: 0, toJSON: () => ({}) });
    Object.defineProperty(arte, 'clientWidth', { value: 400, configurable: true });

    act(() => {
      arte.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 120, bubbles: true }));
      vi.advanceTimersByTime(60);
    });

    expect(contornos.style.getPropertyValue('--mascara')).toContain('radial-gradient');
  });

  it('un trazo del cursor deja varias manchas, no una sola', () => {
    render(<ArteInteractivo />);
    const arte = screen.getByTestId('arte-interactivo');
    const contornos = screen.getByTestId('arte-contornos');
    arte.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 430, right: 400, bottom: 430, x: 0, y: 0, toJSON: () => ({}) });
    Object.defineProperty(arte, 'clientWidth', { value: 400, configurable: true });

    act(() => {
      for (let x = 20; x <= 380; x += 40) {
        arte.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: 150, bubbles: true }));
      }
      vi.advanceTimersByTime(40);
    });

    expect((contornos.style.getPropertyValue('--mascara').match(/radial-gradient/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('cuando nadie la toca, se pinta sola con un trazo de varias manchas', () => {
    render(<ArteInteractivo />);
    const contornos = screen.getByTestId('arte-contornos');

    act(() => {
      vi.advanceTimersByTime(2000); // el primer trazo arranca a los 0.7 s y dura 1.5 s
    });

    expect((contornos.style.getPropertyValue('--mascara').match(/radial-gradient/g) ?? []).length).toBeGreaterThan(2);
  });

  it('al terminar de desvanecerse, la máscara vuelve a no mostrar nada', () => {
    render(<ArteInteractivo />);
    const contornos = screen.getByTestId('arte-contornos');

    act(() => {
      vi.advanceTimersByTime(2400); // termina el primer trazo...
    });
    act(() => {
      vi.advanceTimersByTime(1400); // ...y se apaga la última mancha (antes de que empiece otro trazo)
    });

    expect(contornos.style.getPropertyValue('--mascara')).toBe(MASCARA_VACIA);
  });

  it('con "reducir movimiento" no se anima nada', () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: consulta.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }));
    render(<ArteInteractivo />);
    const contornos = screen.getByTestId('arte-contornos');

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(contornos.style.getPropertyValue('--mascara')).toBe('');
  });
});
