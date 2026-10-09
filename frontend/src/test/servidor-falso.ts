import type { Mock } from 'vitest';

/**
 * Servidor de mentira para las pruebas de pantallas: reemplaza `apiFetch` con una tabla de rutas. Una pantalla de
 * verdad hace varias peticiones a la vez (cifra, periodo, actividad, categorías...), así que cada prueba declara lo
 * que el servidor "sabe" y, por lo demás, falla fuerte: una petición que nadie esperaba rompe la prueba en vez de
 * pasar en silencio.
 *
 * Las llaves son `"MÉTODO /ruta"` (el método por omisión es GET: `'/periodos/activo'` es `'GET /periodos/activo'`).
 * El valor es la respuesta, o una función que la calcula (y puede lanzar un `ApiError`) con el `init` de la petición.
 */
export type Respuesta = unknown | ((init: RequestInit | undefined) => unknown);
export type Rutas = Record<string, Respuesta>;

export interface ServidorFalso {
  /** Cambia o agrega rutas a mitad de una prueba (p. ej. "ahora el periodo ya está cerrado"). */
  poner: (rutas: Rutas) => void;
  /** Las peticiones hechas (con su cuerpo ya leído), para comprobar qué se mandó de verdad. */
  peticiones: () => { metodo: string; ruta: string; cuerpo: unknown }[];
  /** Las hechas con ese método y esa ruta exacta. */
  llamadasA: (metodo: string, ruta: string) => { cuerpo: unknown }[];
}

export function instalarServidorFalso(apiFetch: Mock, rutasIniciales: Rutas): ServidorFalso {
  let tabla: Rutas = { ...rutasIniciales };
  const hechas: { metodo: string; ruta: string; cuerpo: unknown }[] = [];

  apiFetch.mockReset();
  apiFetch.mockImplementation(async (ruta: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const cuerpo = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    hechas.push({ metodo, ruta, cuerpo });

    const llave = metodo === 'GET' ? [ruta, `GET ${ruta}`] : [`${metodo} ${ruta}`];
    const encontrada = llave.find((l) => l in tabla);
    if (encontrada === undefined) throw new Error(`petición inesperada: ${metodo} ${ruta}`);
    const respuesta = tabla[encontrada];
    return typeof respuesta === 'function' ? (respuesta as (i: RequestInit | undefined) => unknown)(init) : respuesta;
  });

  return {
    poner: (rutas) => {
      tabla = { ...tabla, ...rutas };
    },
    peticiones: () => [...hechas],
    llamadasA: (metodo, ruta) => hechas.filter((h) => h.metodo === metodo && h.ruta === ruta),
  };
}
