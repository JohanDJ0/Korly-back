import type { FastifyInstance } from 'fastify';
import { consultarDisponible } from './consultar-disponible.js';
import { montoADto } from '../../shared/http.js';

/**
 * `consultarDisponible` no rastrea `moneda` (ni `obtenerSaldoCuenta` ni
 * el tipo `Disponible` la cargan) — se asume 'MXN', consistente con que
 * multi-moneda está fuera del MVP (documento-maestro-v2.md §4.2) y con
 * el mismo default que ya usa `generar-resumen.ts` cuando no hay de
 * dónde derivarla. Ver README, "Capa HTTP".
 */
const MONEDA_DEFAULT = 'MXN';

export async function rutasDisponible(app: FastifyInstance): Promise<void> {
  app.get('/periodos/activo/disponible', async (request, reply) => {
    const disponible = await consultarDisponible(request.identidad.tenantId);

    if (!disponible) {
      return reply.code(404).send({ codigo: 'PERIODO_NO_ENCONTRADO', mensaje: 'No hay periodo activo' });
    }

    if (disponible.estado === 'sin_ingreso') {
      return reply.send({
        estado: 'sin_ingreso',
        periodoId: disponible.periodoId,
        calculadoEn: disponible.calculadoEn,
      });
    }

    reply.send({
      estado: 'ok',
      periodoId: disponible.periodoId,
      disponible: montoADto(disponible.disponibleValorMinimo, MONEDA_DEFAULT),
      diasRestantes: disponible.diasRestantes,
      cifraDiaria: montoADto(disponible.cifraDiariaValorMinimo, MONEDA_DEFAULT),
      // Extensión sobre openapi.yaml (ver backend/README.md, "Disponible")
      // — sin esto el cliente no puede distinguir "cifraDiaria negativa
      // porque te pasaste hoy" de "negativa porque el periodo entero va
      // mal", ni mostrar cuánto llevas gastado hoy en específico.
      gastadoHoy: montoADto(disponible.gastadoHoyValorMinimo, MONEDA_DEFAULT),
      calculadoEn: disponible.calculadoEn,
    });
  });
}
