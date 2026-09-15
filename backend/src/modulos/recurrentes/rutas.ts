import type { FastifyInstance } from 'fastify';
import { actualizarGastoRecurrente, crearGastoRecurrente, listarGastosRecurrentes, type GastoRecurrente } from './recurrentes.js';
import { ErrorDominio } from '../../shared/errores.js';
import { montoADto, montoDesdeDto, type MontoDto } from '../../shared/http.js';

function recurrenteADto(recurrente: GastoRecurrente) {
  return {
    id: recurrente.id,
    descripcion: recurrente.descripcion,
    monto: montoADto(recurrente.montoValorMinimo, recurrente.moneda),
    categoriaId: recurrente.categoriaId,
    frecuencia: recurrente.frecuencia,
    diaMes: recurrente.diaMes,
    activo: recurrente.activo,
  };
}

interface CrearGastoRecurrenteBody {
  descripcion?: string;
  monto?: MontoDto;
  categoriaId?: string | null;
  frecuencia?: string;
  diaMes?: number | null;
}

interface ActualizarGastoRecurrenteBody {
  descripcion?: string;
  monto?: MontoDto;
  categoriaId?: string | null;
  frecuencia?: string;
  diaMes?: number | null;
  activo?: boolean;
}

/**
 * Extensión sobre `docs/openapi.yaml` (que no define gastos recurrentes
 * — documento-maestro-v2.md §12, brecha de Fase 2): ver backend/README.md,
 * sección "Gastos recurrentes".
 */
export async function rutasRecurrentes(app: FastifyInstance): Promise<void> {
  app.get('/gastos-recurrentes', async (request, reply) => {
    const recurrentes = await listarGastosRecurrentes(request.identidad.tenantId);
    reply.send(recurrentes.map(recurrenteADto));
  });

  app.post('/gastos-recurrentes', async (request, reply) => {
    const body = request.body as CrearGastoRecurrenteBody | undefined;
    if (!body?.descripcion) {
      throw new ErrorDominio('VALIDACION', "El campo 'descripcion' es obligatorio");
    }
    if (!body.monto) {
      throw new ErrorDominio('VALIDACION', "El campo 'monto' es obligatorio");
    }
    if (!body.frecuencia) {
      throw new ErrorDominio('VALIDACION', "El campo 'frecuencia' es obligatorio");
    }
    const { valorMinimo, moneda } = montoDesdeDto(body.monto);

    const recurrente = await crearGastoRecurrente({
      tenantId: request.identidad.tenantId,
      descripcion: body.descripcion,
      montoValorMinimo: valorMinimo,
      moneda,
      categoriaId: body.categoriaId,
      frecuencia: body.frecuencia,
      diaMes: body.diaMes,
    });
    reply.code(201).send(recurrenteADto(recurrente));
  });

  app.patch<{ Params: { recurrenteId: string } }>('/gastos-recurrentes/:recurrenteId', async (request, reply) => {
    const body = (request.body as ActualizarGastoRecurrenteBody | undefined) ?? {};

    const recurrente = await actualizarGastoRecurrente({
      tenantId: request.identidad.tenantId,
      id: request.params.recurrenteId,
      descripcion: body.descripcion,
      montoValorMinimo: body.monto ? montoDesdeDto(body.monto).valorMinimo : undefined,
      moneda: body.monto ? montoDesdeDto(body.monto).moneda : undefined,
      categoriaId: body.categoriaId,
      frecuencia: body.frecuencia,
      diaMes: body.diaMes,
      activo: body.activo,
    });
    reply.send(recurrenteADto(recurrente));
  });
}
