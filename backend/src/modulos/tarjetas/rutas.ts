import type { FastifyInstance } from 'fastify';
import {
  type CargoDetallado,
  listarCargosTarjeta,
  listarPagosTarjetaDePeriodo,
  type PagoTarjetaAplicado,
  registrarCargoTarjeta,
} from './registrar-cargo.js';
import { crearTarjeta, listarTarjetas, type TarjetaConSaldo } from './tarjetas.js';
import { ErrorDominio } from '../../shared/errores.js';
import { montoADto, montoDesdeDto, type MontoDto } from '../../shared/http.js';

function tarjetaADto(tarjeta: TarjetaConSaldo) {
  return {
    id: tarjeta.id,
    nombre: tarjeta.nombre,
    limiteCredito: montoADto(tarjeta.limiteCreditoValorMinimo, tarjeta.moneda),
    // Nunca el saldo crudo del ledger (negativo cuando hay deuda) — el
    // cliente no tiene por qué conocer esa convención interna, ve "cuánto
    // debo" y "cuánto me queda" como dos cifras positivas y claras.
    deuda: montoADto(-tarjeta.saldoValorMinimo, tarjeta.moneda),
    creditoDisponible: montoADto(tarjeta.creditoDisponibleValorMinimo, tarjeta.moneda),
    diaCorte: tarjeta.diaCorte,
    diasParaPago: tarjeta.diasParaPago,
  };
}

function cargoADto(cargo: CargoDetallado) {
  return {
    id: cargo.id,
    descripcion: cargo.descripcion,
    montoTotal: montoADto(cargo.montoTotalValorMinimo, cargo.moneda),
    numeroPlazos: cargo.numeroPlazos,
    categoriaId: cargo.categoriaId,
    fechaCompra: cargo.fechaCompra,
    mensualidades: cargo.mensualidades.map((m) => ({
      numeroPago: m.numeroPago,
      monto: montoADto(m.montoValorMinimo, cargo.moneda),
      fechaVencimiento: m.fechaVencimiento,
      pagado: m.pagado,
    })),
  };
}

function pagoAplicadoADto(pago: PagoTarjetaAplicado) {
  return {
    tarjetaNombre: pago.tarjetaNombre,
    cargoDescripcion: pago.cargoDescripcion,
    numeroPago: pago.numeroPago,
    numeroPlazos: pago.numeroPlazos,
    monto: montoADto(pago.montoValorMinimo, pago.moneda),
  };
}

interface CrearTarjetaBody {
  nombre?: string;
  limiteCredito?: MontoDto;
  diaCorte?: number;
  diasParaPago?: number;
}

interface RegistrarCargoBody {
  descripcion?: string;
  monto?: MontoDto;
  numeroPlazos?: number;
  categoriaId?: string | null;
  fechaCompra?: string;
}

/**
 * Extensión sobre `docs/openapi.yaml` (documento-maestro-v2.md,
 * diferenciador #3: "tarjetas de crédito y MSI modelados nativamente"
 * — ver backend/README.md, "Tarjetas de crédito y MSI").
 */
export async function rutasTarjetas(app: FastifyInstance): Promise<void> {
  app.get('/tarjetas', async (request, reply) => {
    const tarjetas = await listarTarjetas(request.identidad.tenantId);
    reply.send(tarjetas.map(tarjetaADto));
  });

  app.post('/tarjetas', async (request, reply) => {
    const body = request.body as CrearTarjetaBody | undefined;
    if (!body?.nombre) {
      throw new ErrorDominio('VALIDACION', "El campo 'nombre' es obligatorio");
    }
    if (!body.limiteCredito) {
      throw new ErrorDominio('VALIDACION', "El campo 'limiteCredito' es obligatorio");
    }
    if (body.diaCorte === undefined) {
      throw new ErrorDominio('VALIDACION', "El campo 'diaCorte' es obligatorio");
    }
    if (body.diasParaPago === undefined) {
      throw new ErrorDominio('VALIDACION', "El campo 'diasParaPago' es obligatorio");
    }
    const { valorMinimo, moneda } = montoDesdeDto(body.limiteCredito);

    const tarjeta = await crearTarjeta(request.identidad.tenantId, body.nombre, valorMinimo, moneda, body.diaCorte, body.diasParaPago);
    reply.code(201).send(
      tarjetaADto({
        ...tarjeta,
        saldoValorMinimo: 0n,
        creditoDisponibleValorMinimo: tarjeta.limiteCreditoValorMinimo,
      })
    );
  });

  app.get<{ Params: { tarjetaId: string } }>('/tarjetas/:tarjetaId/cargos', async (request, reply) => {
    const cargos = await listarCargosTarjeta(request.identidad.tenantId, request.params.tarjetaId);
    reply.send(cargos.map(cargoADto));
  });

  app.post<{ Params: { tarjetaId: string } }>('/tarjetas/:tarjetaId/cargos', async (request, reply) => {
    const body = request.body as RegistrarCargoBody | undefined;
    if (!body?.descripcion) {
      throw new ErrorDominio('VALIDACION', "El campo 'descripcion' es obligatorio");
    }
    if (!body.monto) {
      throw new ErrorDominio('VALIDACION', "El campo 'monto' es obligatorio");
    }
    const { valorMinimo, moneda } = montoDesdeDto(body.monto);

    const resultado = await registrarCargoTarjeta({
      tenantId: request.identidad.tenantId,
      tarjetaId: request.params.tarjetaId,
      descripcion: body.descripcion,
      montoTotalValorMinimo: valorMinimo,
      moneda,
      numeroPlazos: body.numeroPlazos ?? 1,
      categoriaId: body.categoriaId,
      fechaCompra: body.fechaCompra,
    });

    reply.code(201).send({
      id: resultado.id,
      mensualidades: resultado.mensualidades.map((m) => ({
        numeroPago: m.numeroPago,
        monto: montoADto(m.montoValorMinimo, moneda),
        fechaVencimiento: m.fechaVencimiento,
      })),
    });
  });

  /**
   * Hallazgo real (ver registrar-cargo.ts, `listarPagosTarjetaDePeriodo`):
   * un `pago_tarjeta` nunca aparece en `GET /periodos/:id/gastos` (es un
   * tipo de movimiento distinto), así que sin esto no había ninguna
   * forma de saber, para un periodo dado, qué mensualidades de tarjeta
   * ya se le aplicaron. Usado tanto por el aviso proactivo en Home
   * (periodo activo) como por Historial (cualquier periodo, pasado o
   * presente).
   */
  app.get<{ Params: { periodoId: string } }>('/periodos/:periodoId/pagos-tarjeta', async (request, reply) => {
    const pagos = await listarPagosTarjetaDePeriodo(request.identidad.tenantId, request.params.periodoId);
    reply.send(pagos.map(pagoAplicadoADto));
  });
}
