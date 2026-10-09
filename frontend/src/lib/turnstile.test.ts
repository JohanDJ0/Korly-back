import { afterEach, describe, expect, it, vi } from 'vitest';

import { cargarTurnstile, claveDeSitioTurnstile, reiniciarCargaTurnstileParaPruebas } from '@/lib/turnstile';
import { instalarTurnstileFalso, quitarTurnstileFalso } from '@/test/turnstile-falso';

afterEach(() => {
  vi.unstubAllEnvs();
  quitarTurnstileFalso();
  reiniciarCargaTurnstileParaPruebas();
  document.head.querySelectorAll('script[src*="turnstile"]').forEach((s) => s.remove());
});

describe('claveDeSitioTurnstile', () => {
  it('sin la variable (o vacía) el captcha está apagado', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    expect(claveDeSitioTurnstile()).toBeUndefined();
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '   ');
    expect(claveDeSitioTurnstile()).toBeUndefined();
  });

  it('con la variable devuelve la llave pública', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', ' 0x4AAAA-publica ');
    expect(claveDeSitioTurnstile()).toBe('0x4AAAA-publica');
  });
});

describe('cargarTurnstile', () => {
  it('si Cloudflare ya está cargado, no vuelve a insertar el script', async () => {
    const falso = instalarTurnstileFalso();

    await expect(cargarTurnstile()).resolves.toBe(falso.api);
    expect(document.head.querySelector('script[src*="turnstile"]')).toBeNull();
  });

  it('inserta el script una sola vez aunque lo pidan varios formularios, y resuelve cuando carga', async () => {
    const a = cargarTurnstile();
    const b = cargarTurnstile();

    const scripts = document.head.querySelectorAll('script[src*="challenges.cloudflare.com/turnstile"]');
    expect(scripts).toHaveLength(1);
    const falso = instalarTurnstileFalso();
    (scripts[0] as HTMLScriptElement).onload?.(new Event('load'));

    await expect(a).resolves.toBe(falso.api);
    await expect(b).resolves.toBe(falso.api);
  });

  it('si el script no carga (bloqueador, sin red) se rechaza y se puede reintentar', async () => {
    const primero = cargarTurnstile();
    const script = document.head.querySelector('script[src*="turnstile"]') as HTMLScriptElement;
    script.onerror?.(new Event('error'));

    await expect(primero).rejects.toThrow('No se pudo cargar Turnstile');

    const segundo = cargarTurnstile();
    expect(document.head.querySelectorAll('script[src*="turnstile"]')).toHaveLength(1); // el anterior se retiró, este es nuevo
    const falso = instalarTurnstileFalso();
    (document.head.querySelector('script[src*="turnstile"]') as HTMLScriptElement).onload?.(new Event('load'));
    await expect(segundo).resolves.toBe(falso.api);
  });
});
