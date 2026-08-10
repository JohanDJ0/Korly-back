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
 * Extensión propia, NO especificada por modelo-dominio.md: si "hoy" ya
 * pasó `fechaFin` (el periodo debería estar cerrado, pero el módulo de
 * cierre todavía no existe — ver README, sección de periodos), la resta
 * cruda daría 0 o negativo. En vez de dividir entre cero o invertir el
 * signo de la cifra diaria por un tecnicismo de fechas, se fija un piso
 * de 1 día. Es la lectura más conservadora mientras no exista cierre
 * automático, no un caso que el modelo de dominio haya resuelto — de
 * ahí que esté separado y documentado aparte de la fórmula de arriba.
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
