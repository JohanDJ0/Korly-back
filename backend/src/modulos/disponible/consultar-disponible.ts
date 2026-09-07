import { existeIngresoParaPeriodo } from '../ingresos/registrar-ingreso.js';
import { obtenerNetoCuentaEnFecha, obtenerSaldoCuenta } from '../ledger/registrar-movimiento.js';
import { obtenerPeriodoActivo } from '../periodos/crear-periodo.js';
import { fechaISO } from '../../shared/fechas.js';
import { calcularDiasRestantes, pisoDivisionBigInt } from './motor-flujo-caja.js';

export interface DisponibleOk {
  estado: 'ok';
  periodoId: string;
  disponibleValorMinimo: bigint;
  diasRestantes: number;
  cifraDiariaValorMinimo: bigint;
  /** Cuánto se ha gastado (neto, tras restas por reversión) específicamente hoy. Nunca negativo. */
  gastadoHoyValorMinimo: bigint;
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
 * **La cifra de "hoy" es un objetivo fijo, no un residuo que se vuelve
 * a repartir en cada consulta del mismo día.** Hallazgo real: la
 * versión anterior dividía `disponible / díasRestantes` sin excluir lo
 * gastado hoy — así que gastar exactamente lo sugerido hacía bajar la
 * cifra de "hoy" en la misma consulta (como si el gasto se hubiera
 * repartido también hacia atrás), y un sobregiro grande hoy podía
 * mostrar un número pequeño pero todavía positivo, ocultando que ya se
 * había rebasado por mucho. La fórmula correcta -y la que sí coincide
 * con la frase de modelo-dominio.md §5 "si un día se gasta de más, la
 * cifra del día siguiente baja sola"- calcula el objetivo de hoy sobre
 * lo que había ANTES de cualquier gasto de hoy, y solo le resta lo
 * gastado hoy:
 *
 *   gastadoHoy        = max(0, -Σ asientos de tipo 'gasto'/'reversion' de HOY)
 *   disponibleBaseHoy = disponible + gastadoHoy   [deshace el efecto de hoy]
 *   objetivoHoy       = piso(disponibleBaseHoy / díasRestantes)
 *   cifraDiaria       = objetivoHoy - gastadoHoy  [puede ser negativa: te pasaste hoy]
 *
 * Al día siguiente, `disponible` ya refleja lo real de hoy (de más o de
 * menos) y `díasRestantes` bajó uno - ahí es donde ocurre la
 * redistribución, nunca a mitad del mismo día.
 *
 * **Por qué el corte se restringe a los tipos `['gasto', 'reversion']`
 * y no al neto de "todo lo de hoy":** se probó primero con el neto de
 * TODOS los asientos de hoy, y falla justo en el caso más común - el
 * día 1, con el ingreso y el primer gasto fechados el mismo día. Un
 * ingreso de 5000 y un gasto de 555 el mismo día dan un neto de +4445
 * (positivo), así que "gastado hoy" habría salido en 0 - el gasto real
 * quedó escondido detrás del ingreso, más grande. Restringir a
 * `'gasto'`/`'reversion'` evita que un ingreso del mismo día tape un
 * gasto real, y sigue dejando que revertir un gasto el mismo día que se
 * registró (editar/eliminar, ver modulos/gastos) cancele exactamente su
 * propio efecto - la reversión de un gasto es del tipo `'reversion'`,
 * no `'ingreso'`, así que el neto de esos dos tipos vuelve a cero.
 *
 * Deliberadamente NO corre dentro de una única transacción: es una
 * composición de lecturas (periodo activo, ¿hay ingreso?, saldo, corte
 * de hoy), y a diferencia de un registro de escritura como
 * registrarIngreso -donde "todo o nada" es un requisito real- una
 * pequeña discrepancia entre lecturas si algo se escribe a la mitad de
 * la consulta no es un bug para un número que el propio modelo de
 * dominio define como recalculado en cada consulta, no como una
 * fotografía congelada.
 */
export async function consultarDisponible(tenantId: string, fechaReferencia: Date = new Date()): Promise<Disponible | null> {
  const periodo = await obtenerPeriodoActivo(tenantId, fechaReferencia);
  if (!periodo) return null;

  const hayIngreso = await existeIngresoParaPeriodo(tenantId, periodo.id);
  if (!hayIngreso) {
    return { estado: 'sin_ingreso', periodoId: periodo.id, calculadoEn: fechaReferencia };
  }

  const disponibleValorMinimo = await obtenerSaldoCuenta(tenantId, periodo.cuentaId);
  const diasRestantes = calcularDiasRestantes(periodo.fechaFin, fechaReferencia);

  const netoGastosHoy = await obtenerNetoCuentaEnFecha(tenantId, periodo.cuentaId, fechaISO(fechaReferencia), ['gasto', 'reversion']);
  const gastadoHoyValorMinimo = netoGastosHoy < 0n ? -netoGastosHoy : 0n;
  const disponibleBaseHoy = disponibleValorMinimo + gastadoHoyValorMinimo;
  const objetivoHoy = pisoDivisionBigInt(disponibleBaseHoy, BigInt(diasRestantes));
  const cifraDiariaValorMinimo = objetivoHoy - gastadoHoyValorMinimo;

  return {
    estado: 'ok',
    periodoId: periodo.id,
    disponibleValorMinimo,
    diasRestantes,
    cifraDiariaValorMinimo,
    gastadoHoyValorMinimo,
    calculadoEn: fechaReferencia,
  };
}
