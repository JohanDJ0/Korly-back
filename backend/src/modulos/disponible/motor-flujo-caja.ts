/**
 * Matemática pura del motor de flujo de caja (modelo-dominio.md §5):
 *
 *   disponible      = Σ ingresos del periodo − Σ gastos del periodo
 *   días_restantes  = (fecha_fin del periodo − hoy) + 1
 *   cifra_diaria    = piso( disponible ÷ días_restantes )
 *
 * Sin base de datos a propósito — se prueba como función pura en
 * test/unidad/motor-flujo-caja.test.ts. `consultar-disponible.ts` es
 * quien junta esto con periodos y el ledger.
 */

/**
 * El `+1` evita dividir entre cero el último día del periodo: si hoy es
 * exactamente `fechaFin`, el resultado es 1 día, no 0.
 *
 * El `Math.max(1, ...)` es una extensión propia, NO especificada por
 * modelo-dominio.md, para cuando "hoy" ya pasó `fechaFin`.
 *
 * ACTUALIZACIÓN (módulo de cierre): esto ya **no debería ocurrir en el
 * camino normal**. `obtenerPeriodoActivo`/`obtenerPeriodoPorId`
 * (modulos/periodos/crear-periodo.ts) resuelven el cierre perezoso
 * antes de devolver un periodo — un periodo con `fechaFin` pasada ya no
 * se devuelve como `'activo'`, así que `consultarDisponible` nunca
 * debería recibir uno vencido para calcularle días restantes. El tope
 * de aquí queda como **salvaguarda defensiva** (cinturón y tirantes,
 * mismo espíritu que el `tenantId` redundante en `obtenerPeriodoPorIdTx`),
 * no como el mecanismo que evita la división por cero en la práctica.
 * Si algún test de cierre llega a depender de este tope para pasar, es
 * señal de que la resolución perezosa de periodos tiene un hueco — no
 * una razón para relajar esto.
 */
export function calcularDiasRestantes(fechaFin: string, fechaReferencia: Date): number {
  const fin = Date.UTC(...partesFechaISO(fechaFin));
  const hoy = Date.UTC(fechaReferencia.getUTCFullYear(), fechaReferencia.getUTCMonth(), fechaReferencia.getUTCDate());
  const diffDias = Math.round((fin - hoy) / 86_400_000) + 1;
  return Math.max(1, diffDias);
}

function partesFechaISO(fechaISO: string): [number, number, number] {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return [anio!, mes! - 1, dia!];
}

/**
 * División entera hacia el piso matemático (ADR-002: "el redondeo de la
 * cifra diaria se trunca hacia abajo. El error debe favorecer al
 * usuario").
 *
 * El operador `/` de `bigint` en JavaScript trunca hacia CERO, no hacia
 * el piso — son lo mismo para dividendos positivos, pero no para
 * negativos: `-1000n / 7n` dan `-142n` truncado, cuando el piso
 * matemático de `-142.857...` es `-143n`. Para un sobregiro (disponible
 * negativo), truncar hacia cero *subestima* cuánto se está gastando de
 * más; el piso lo muestra completo. Por eso no basta el operador nativo
 * y esta función corrige el caso en que el residuo no es cero y el
 * signo del residuo difiere del signo del divisor.
 */
export function pisoDivisionBigInt(dividendo: bigint, divisor: bigint): bigint {
  const cociente = dividendo / divisor;
  const residuo = dividendo % divisor;
  if (residuo !== 0n && residuo < 0n !== divisor < 0n) {
    return cociente - 1n;
  }
  return cociente;
}
