import type { FastifyInstance } from 'fastify';
import {
  aportarAMeta,
  crearMeta,
  deshacerPagoMeta,
  editarMeta,
  eliminarMeta,
  listarMetas,
  listarMovimientosDeMeta,
  pagarConMeta,
  retirarDeMeta,
  type MetaConProgreso,
} from './metas.js';
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

interface EditarMetaBody {
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

interface CrearPagoBody {
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

  /** Cambia el nombre y/o el objetivo; el avance se recalcula solo (ver `editarMeta`). */
  app.patch<{ Params: { metaId: string } }>('/metas/:metaId', async (request, reply) => {
    const body = request.body as EditarMetaBody | undefined;
    const montoObjetivo = body?.montoObjetivo ? montoDesdeDto(body.montoObjetivo) : undefined;

    await editarMeta({
      tenantId: request.identidad.tenantId,
      metaId: request.params.metaId,
      nombre: body?.nombre,
      montoObjetivo: montoObjetivo?.valorMinimo,
    });

    const metas = await listarMetas(request.identidad.tenantId);
    const meta = metas.find((m) => m.id === request.params.metaId);
    if (!meta) throw new ErrorDominio('META_NO_ENCONTRADA', 'La meta especificada no existe');
    reply.send(metaADto(meta));
  });

  app.delete<{ Params: { metaId: string } }>('/metas/:metaId', async (request, reply) => {
    await eliminarMeta(request.identidad.tenantId, request.params.metaId);
    reply.code(204).send();
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

  /** Pago directo desde la meta, sin pasar por la quincena (ver `pagarConMeta`). */
  app.post<{ Params: { metaId: string } }>('/metas/:metaId/pagos', async (request, reply) => {
    const body = request.body as CrearPagoBody | undefined;
    if (!body?.monto) {
      throw new ErrorDominio('VALIDACION', "El campo 'monto' es obligatorio");
    }
    if (!body.motivo) {
      throw new ErrorDominio('VALIDACION', "El campo 'motivo' es obligatorio");
    }
    const { valorMinimo, moneda } = montoDesdeDto(body.monto);

    const resultado = await pagarConMeta({
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
      motivo: body.motivo.trim(),
    });
  });

  app.delete<{ Params: { metaId: string; movimientoId: string } }>('/metas/:metaId/pagos/:movimientoId', async (request, reply) => {
    await deshacerPagoMeta(request.identidad.tenantId, request.params.metaId, request.params.movimientoId);
    reply.code(204).send();
  });

  app.get<{ Params: { metaId: string } }>('/metas/:metaId/movimientos', async (request, reply) => {
    const movimientos = await listarMovimientosDeMeta(request.identidad.tenantId, request.params.metaId);
    reply.send(
      movimientos.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        monto: montoADto(m.montoValorMinimo, m.moneda),
        fechaEfectiva: m.fechaEfectiva,
        nota: m.nota,
        revertido: m.revertido,
      }))
    );
  });
}
