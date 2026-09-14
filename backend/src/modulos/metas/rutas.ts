import type { FastifyInstance } from 'fastify';
import { aportarAMeta, crearMeta, listarMetas, retirarDeMeta, type MetaConProgreso } from './metas.js';
import { ErrorDominio } from '../../shared/errores.js';
import { montoADto, montoDesdeDto, type MontoDto } from '../../shared/http.js';

function metaADto(meta: MetaConProgreso) {
  return {
    id: meta.id,
    nombre: meta.nombre,
    montoObjetivo: montoADto(meta.montoObjetivoValorMinimo, meta.moneda),
    montoAcumulado: montoADto(meta.montoAcumuladoValorMinimo, meta.moneda),
    porcentajeAvance: meta.porcentajeAvance,
  };
}

interface CrearMetaBody {
  nombre?: string;
  montoObjetivo?: MontoDto;
}

interface CrearAporteBody {
  monto?: MontoDto;
}

interface CrearRetiroBody {
  monto?: MontoDto;
  motivo?: string;
}

/**
 * Respuestas de aportar/retirar deliberadamente más delgadas que
 * `Aporte`/`Retiro` de docs/openapi.yaml (que incluyen `fechaRegistro`
 * ecoada de vuelta) — no existe una tabla `aportes`/`retiros` (ver
 * README, "Metas de ahorro": el contrato no define ningún `GET` para
 * listarlos, así que `movimientos` ya alcanza), y traer `fechaRegistro`
 * pediría una consulta extra a `movimientos` que ningún caller pide
 * todavía. Mismo criterio que ya usan ingresos/gastos en sus rutas de
 * `POST`.
 */
export async function rutasMetas(app: FastifyInstance): Promise<void> {
  app.post('/metas', async (request, reply) => {
    const body = request.body as CrearMetaBody | undefined;
    if (!body?.nombre) {
      throw new ErrorDominio('VALIDACION', "El campo 'nombre' es obligatorio");
    }
    if (!body.montoObjetivo) {
      throw new ErrorDominio('VALIDACION', "El campo 'montoObjetivo' es obligatorio");
    }
    const { valorMinimo, moneda } = montoDesdeDto(body.montoObjetivo);

    const meta = await crearMeta(request.identidad.tenantId, body.nombre, valorMinimo, moneda);
    reply.code(201).send(metaADto({ ...meta, montoAcumuladoValorMinimo: 0n, porcentajeAvance: 0 }));
  });

  app.get('/metas', async (request, reply) => {
    const metas = await listarMetas(request.identidad.tenantId);
    reply.send(metas.map(metaADto));
  });

  app.post<{ Params: { metaId: string } }>('/metas/:metaId/aportes', async (request, reply) => {
    const body = request.body as CrearAporteBody | undefined;
    if (!body?.monto) {
      throw new ErrorDominio('VALIDACION', "El campo 'monto' es obligatorio");
    }
    const { valorMinimo, moneda } = montoDesdeDto(body.monto);

    const resultado = await aportarAMeta({
      tenantId: request.identidad.tenantId,
      metaId: request.params.metaId,
      monto: valorMinimo,
      moneda,
    });

    reply.code(201).send({
      id: resultado.id,
      metaId: resultado.metaId,
      monto: montoADto(valorMinimo, moneda),
      periodoOrigenId: resultado.periodoOrigenId,
    });
  });

  app.post<{ Params: { metaId: string } }>('/metas/:metaId/retiros', async (request, reply) => {
    const body = request.body as CrearRetiroBody | undefined;
    if (!body?.monto) {
      throw new ErrorDominio('VALIDACION', "El campo 'monto' es obligatorio");
    }
    if (!body.motivo) {
      throw new ErrorDominio('VALIDACION', "El campo 'motivo' es obligatorio");
    }
    const { valorMinimo, moneda } = montoDesdeDto(body.monto);

    const resultado = await retirarDeMeta({
      tenantId: request.identidad.tenantId,
      metaId: request.params.metaId,
      monto: valorMinimo,
      moneda,
      motivo: body.motivo,
    });

    reply.code(201).send({
      id: resultado.id,
      metaId: resultado.metaId,
      monto: montoADto(valorMinimo, moneda),
      motivo: body.motivo,
    });
  });
}
