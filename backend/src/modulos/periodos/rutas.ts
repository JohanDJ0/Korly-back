import type { FastifyInstance } from 'fastify';
import { crearPeriodo, listarPeriodos, obtenerPeriodoActivo } from './crear-periodo.js';
import type { TipoPeriodoSoportado } from '../../db/schema/periodos.js';

interface CrearPeriodoBody {
  tipo?: string;
}

/**
 * Validación mínima aquí a propósito: la única regla real ("tipo debe
 * ser 'quincenal'") ya la aplica `crearPeriodo` internamente y lanza
 * `ErrorDominio('VALIDACION', ...)` — el manejador global
 * (shared/http.ts) lo traduce a 400. Repetir el chequeo aquí sería
 * duplicar la misma validación en dos capas.
 */
export async function rutasPeriodos(app: FastifyInstance): Promise<void> {
  app.post('/periodos', async (request, reply) => {
    const body = request.body as CrearPeriodoBody | undefined;
    const periodo = await crearPeriodo(request.identidad.tenantId, (body?.tipo ?? '') as TipoPeriodoSoportado);
    reply.code(201).send(periodo);
  });

  app.get('/periodos/activo', async (request, reply) => {
    const periodo = await obtenerPeriodoActivo(request.identidad.tenantId);
    if (!periodo) {
      return reply.code(404).send({ codigo: 'PERIODO_NO_ENCONTRADO', mensaje: 'No hay periodo activo' });
    }
    reply.send(periodo);
  });

  app.get('/periodos', async (request, reply) => {
    const periodos = await listarPeriodos(request.identidad.tenantId);
    reply.send(periodos);
  });
}
