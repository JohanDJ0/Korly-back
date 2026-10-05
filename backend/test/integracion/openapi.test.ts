import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { crearApp } from '../../src/app.js';

/**
 * ADR-010: el contrato (docs/openapi.yaml) se mantiene a mano, así que esta
 * prueba es lo que impide que se desfase en silencio — lo que ADR-006 advertía
 * que pasaría. Compara las rutas que el servidor registra de verdad contra las
 * operaciones documentadas, en las dos direcciones, y revisa que el archivo
 * esté bien armado (referencias que resuelven, parámetros de ruta declarados).
 *
 * No compara los campos de cada respuesta: eso sigue siendo trabajo manual y
 * es lo que cubren las pruebas de cada módulo.
 */
type Operacion = { tags?: string[]; parameters?: unknown[]; responses?: Record<string, unknown>; summary?: string };
type Documento = {
  paths: Record<string, Record<string, Operacion | unknown>>;
  components: { parameters: Record<string, { name: string; in: string }>; schemas: Record<string, unknown>; responses: Record<string, unknown> };
};

const METODOS = ['get', 'post', 'patch', 'put', 'delete'] as const;

const documento = parse(readFileSync(resolve(__dirname, '../../../docs/openapi.yaml'), 'utf8')) as Documento;

function operacionesDocumentadas(): Set<string> {
  const operaciones = new Set<string>();
  for (const [ruta, definicion] of Object.entries(documento.paths)) {
    for (const metodo of METODOS) {
      if (metodo in definicion) operaciones.add(`${metodo.toUpperCase()} ${ruta}`);
    }
  }
  return operaciones;
}

/** `/v1/periodos/:periodoId/gastos` → `/periodos/{periodoId}/gastos`, igual que se escribe en el contrato. */
function rutaComoContrato(url: string): string {
  return url.replace(/^\/v1/, '').replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

describe('contrato OpenAPI (docs/openapi.yaml)', () => {
  const app = crearApp({ logger: false });
  const registradas = new Set<string>();
  app.addHook('onRoute', (ruta) => {
    for (const metodo of ([] as string[]).concat(ruta.method as string | string[])) {
      if (metodo === 'HEAD' || metodo === 'OPTIONS') continue;
      registradas.add(`${metodo} ${rutaComoContrato(ruta.url)}`);
    }
  });

  /**
   * El hook de arriba solo ve las rutas que se registran DESPUÉS de crearlo (las de los
   * plugins, que Fastify carga en `ready`). Los dos chequeos de salud se registran directo
   * en `crearApp`, fuera de `/v1`: se prueban aparte, contra el servidor.
   */
  const FUERA_DE_V1 = ['GET /salud', 'GET /salud/listo'];

  afterAll(async () => {
    await app.close();
  });

  it('toda ruta que registra el servidor está documentada', async () => {
    await app.ready();
    const documentadas = operacionesDocumentadas();

    const sinDocumentar = [...registradas].filter((operacion) => !documentadas.has(operacion)).sort();

    expect(sinDocumentar, `Rutas del servidor que faltan en docs/openapi.yaml:\n${sinDocumentar.join('\n')}`).toEqual([]);
  });

  it('toda operación documentada existe en el servidor', async () => {
    await app.ready();

    const inexistentes = [...operacionesDocumentadas()].filter((operacion) => !registradas.has(operacion) && !FUERA_DE_V1.includes(operacion)).sort();

    expect(inexistentes, `Operaciones de docs/openapi.yaml que el servidor no tiene:\n${inexistentes.join('\n')}`).toEqual([]);
  });

  it('el chequeo de salud documentado responde de verdad', async () => {
    await app.ready();

    const respuesta = await app.inject({ method: 'GET', url: '/salud' });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({ estado: 'ok' });
    expect(operacionesDocumentadas().has('GET /salud/listo')).toBe(true);
  });

  it('todas las referencias $ref apuntan a algo que existe', () => {
    const rotas: string[] = [];
    const visitar = (nodo: unknown, camino: string) => {
      if (Array.isArray(nodo)) {
        nodo.forEach((hijo, i) => visitar(hijo, `${camino}[${i}]`));
      } else if (nodo && typeof nodo === 'object') {
        for (const [clave, valor] of Object.entries(nodo)) {
          if (clave === '$ref' && typeof valor === 'string') {
            const partes = valor.replace(/^#\//, '').split('/');
            let actual: unknown = documento;
            for (const parte of partes) actual = (actual as Record<string, unknown> | undefined)?.[parte];
            if (actual === undefined) rotas.push(`${camino} → ${valor}`);
          } else {
            visitar(valor, `${camino}.${clave}`);
          }
        }
      }
    };
    visitar(documento, 'openapi');

    expect(rotas).toEqual([]);
  });

  it('cada parámetro {x} de una ruta está declarado, y toda operación tiene etiqueta, resumen y respuestas', () => {
    const problemas: string[] = [];
    for (const [ruta, definicion] of Object.entries(documento.paths)) {
      const enRuta = [...ruta.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
      const parametrosDeRuta = ((definicion as { parameters?: unknown[] }).parameters ?? []) as unknown[];

      for (const metodo of METODOS) {
        const operacion = (definicion as Record<string, Operacion | undefined>)[metodo];
        if (!operacion) continue;
        const nombre = `${metodo.toUpperCase()} ${ruta}`;

        const declarados = [...parametrosDeRuta, ...(operacion.parameters ?? [])].map((p) => {
          const parametro = p as { $ref?: string; name?: string; in?: string };
          if (parametro.$ref) {
            const resuelto = documento.components.parameters[parametro.$ref.split('/').pop()!];
            return resuelto?.in === 'path' ? resuelto.name : undefined;
          }
          return parametro.in === 'path' ? parametro.name : undefined;
        });
        for (const esperado of enRuta) {
          if (!declarados.includes(esperado)) problemas.push(`${nombre}: falta declarar el parámetro de ruta {${esperado}}`);
        }
        if (!operacion.tags?.length) problemas.push(`${nombre}: sin etiqueta (tags)`);
        if (!operacion.summary) problemas.push(`${nombre}: sin resumen (summary)`);
        if (!operacion.responses || Object.keys(operacion.responses).length === 0) problemas.push(`${nombre}: sin respuestas`);
      }
    }

    expect(problemas).toEqual([]);
  });
});
