import { vi } from 'vitest';

import type { ApiTurnstile, OpcionesWidget } from '@/lib/turnstile';

export interface TurnstileFalso {
  api: ApiTurnstile;
  /** Los widgets que se han dibujado, en orden. */
  dibujados: { id: string; contenedor: HTMLElement; opciones: OpcionesWidget }[];
  /** Simula que Cloudflare terminó la verificación y entregó un token. */
  resolver: (token: string, indice?: number) => void;
}

/** Instala un `window.turnstile` de mentira: nadie le habla a Cloudflare en las pruebas. */
export function instalarTurnstileFalso(): TurnstileFalso {
  const dibujados: TurnstileFalso['dibujados'] = [];
  const api: ApiTurnstile = {
    render: vi.fn((contenedor: HTMLElement, opciones: OpcionesWidget) => {
      const id = `widget-${dibujados.length + 1}`;
      dibujados.push({ id, contenedor, opciones });
      return id;
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  window.turnstile = api;
  return {
    api,
    dibujados,
    resolver: (token, indice = dibujados.length - 1) => dibujados[indice]?.opciones.callback(token),
  };
}

export function quitarTurnstileFalso(): void {
  delete window.turnstile;
}
