import type { FastifyInstance } from 'fastify';
import { actualizarAtajo, crearAtajo, eliminarAtajo, listarAtajos, type Atajo } from './atajos.js';
import { ErrorDominio } from '../../shared/errores.js';
import { montoADto, montoDesdeDto, type MontoDto } from '../../shared/http.js';

function atajoADto(atajo: Atajo) {
  return {
    id: atajo.id,
    nombre: atajo.nombre,
    monto: montoADto(atajo.montoValorMinimo, atajo.moneda),
    categoriaId: atajo.categoriaId,
  };
}

interface CrearAtajoBody {
  nombre?: string;
  monto?: MontoDto;
  categoriaId?: string | null;
}

interface ActualizarAtajoBody {
  nombre?: string;
  monto?: MontoDto;
  categoriaId?: string | null;
}

/** Atajos de gasto (un toque para registrar "Café $55"): ver backend/README.md, sección "Atajos de gasto". */
export async function rutasAtajos(app: FastifyInstance): Promise<void> {
  app.get('/atajos-gasto', async (request, reply) => {
    const { atajos, limite } = await listarAtajos(request.identidad.tenantId);
    reply.send({ atajos: atajos.map(atajoADto), limite });
  });

  app.post('/atajos-gasto', async (request, reply) => {
    const body = request.body as CrearAtajoBody | undefined;
    if (!body?.nombre) {
      throw new ErrorDominio('VALIDACION', "El campo 'nombre' es obligatorio");
    }
    if (!body.monto) {
      throw new ErrorDominio('VALIDACION', "El campo 'monto' es obligatorio");
    }
    const { valorMinimo, moneda } = montoDesdeDto(body.monto);

    const atajo = await crearAtajo({
      tenantId: request.identidad.tenantId,
      nombre: body.nombre,
      montoValorMinimo: valorMinimo,
      moneda,
      categoriaId: body.categoriaId,
    });
    reply.code(201).send(atajoADto(atajo));
  });

  app.patch<{ Params: { atajoId: string } }>('/atajos-gasto/:atajoId', async (request, reply) => {
    const body = (request.body as ActualizarAtajoBody | undefined) ?? {};
    const monto = body.monto ? montoDesdeDto(body.monto) : undefined;

    const atajo = await actualizarAtajo({
      tenantId: request.identidad.tenantId,
      id: request.params.atajoId,
      nombre: body.nombre,
      montoValorMinimo: monto?.valorMinimo,
      moneda: monto?.moneda,
      categoriaId: body.categoriaId,
    });
    reply.send(atajoADto(atajo));
  });

  app.delete<{ Params: { atajoId: string } }>('/atajos-gasto/:atajoId', async (request, reply) => {
    await eliminarAtajo(request.identidad.tenantId, request.params.atajoId);
    reply.code(204).send();
  });
}
