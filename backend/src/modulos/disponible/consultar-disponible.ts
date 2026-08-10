import { existeIngresoParaPeriodo } from '../ingresos/registrar-ingreso.js';
import { obtenerSaldoCuenta } from '../ledger/registrar-movimiento.js';
import { obtenerPeriodoActivo } from '../periodos/crear-periodo.js';
import { calcularDiasRestantes, pisoDivisionBigInt } from './motor-flujo-caja.js';

export interface DisponibleOk {
  estado: 'ok';
  periodoId: string;
  disponibleValorMinimo: bigint;
  diasRestantes: number;
  cifraDiariaValorMinimo: bigint;
  calculadoEn: Date;
}

export interface DisponibleSinIngreso {
  estado: 'sin_ingreso';
  periodoId: string;
  calculadoEn: Date;
}

export type Disponible = DisponibleOk | DisponibleSinIngreso;

/**
 * Motor de flujo de caja (modelo-dominio.md §5) — el número que es el
 * producto. `null` si no hay periodo activo (nada que calcular).
 *
 * No hay nada que guardar aquí y nada se guarda: cada llamada vuelve a
 * leer el periodo activo, vuelve a comprobar si hay ingreso, y vuelve a
 * sumar los asientos del ledger para el saldo. No existe una columna
 * "disponible" en ningún schema — grep por `disponible` en `db/schema/`
 * no encuentra nada que persistir, porque `obtenerSaldoCuenta` sigue
 * siendo "el saldo es la suma de los asientos" (ADR-001), nunca un
 * campo cacheado.
 *
 * Deliberadamente NO corre dentro de una única transacción: es una
 * composición de lecturas (periodo activo, ¿hay ingreso?, saldo), y a
 * diferencia de un registro de escritura como registrarIngreso — donde
 * "todo o nada" es un requisito real — una pequeña discrepancia entre
 * lecturas si algo se escribe a la mitad de la consulta no es un bug
 * para un número que el propio modelo de dominio define como
 * recalculado en cada consulta, no como una fotografía congelada.
 */
export async function consultarDisponible(tenantId: string, fechaReferencia: Date = new Date()): Promise<Disponible | null> {
  const periodo = await obtenerPeriodoActivo(tenantId);
  if (!periodo) return null;

  const hayIngreso = await existeIngresoParaPeriodo(tenantId, periodo.id);
  if (!hayIngreso) {
    return { estado: 'sin_ingreso', periodoId: periodo.id, calculadoEn: fechaReferencia };
  }

  const disponibleValorMinimo = await obtenerSaldoCuenta(tenantId, periodo.cuentaId);
  const diasRestantes = calcularDiasRestantes(periodo.fechaFin, fechaReferencia);
  const cifraDiariaValorMinimo = pisoDivisionBigInt(disponibleValorMinimo, BigInt(diasRestantes));

  return {
    estado: 'ok',
    periodoId: periodo.id,
    disponibleValorMinimo,
    diasRestantes,
    cifraDiariaValorMinimo,
    calculadoEn: fechaReferencia,
  };
}
