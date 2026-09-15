/**
 * RFC 4180 mínimo: solo hace falta comillas si el valor trae coma,
 * comilla o salto de línea — el resto de los campos de este dominio
 * (fechas ISO, montos, nombres de categoría) nunca los traen, pero
 * `nota` es texto libre del usuario y sí puede.
 */
export function escaparCsv(valor: string): string {
  if (/[",\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

export function filaCsv(valores: string[]): string {
  return valores.map(escaparCsv).join(',') + '\r\n';
}

/**
 * Exacto en centavos, sin pasar por `Number` (ADR-002 acepta esa
 * conversión en el límite HTTP porque el contrato de openapi.yaml pide
 * `integer`, pero un CSV no tiene esa restricción — aquí no hace falta
 * arriesgar precisión para montos grandes).
 */
export function centavosADecimalCsv(valorMinimo: bigint): string {
  const negativo = valorMinimo < 0n;
  const absoluto = negativo ? -valorMinimo : valorMinimo;
  const pesos = absoluto / 100n;
  const centavos = (absoluto % 100n).toString().padStart(2, '0');
  return `${negativo ? '-' : ''}${pesos}.${centavos}`;
}
