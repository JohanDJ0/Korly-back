export interface MontoDto {
  valorMinimo: number;
  moneda: string;
}

/**
 * Único lugar del frontend que convierte el entero en centavos a una
 * representación para el usuario — el mismo principio de ADR-002 ("un
 * solo lugar en el código convierte entre entero y presentación") en
 * el otro extremo del sistema. El backend ya hizo la mitad del trabajo
 * (bigint → integer en shared/http.ts); aquí solo falta integer → texto.
 */
export function formatearMonto({ valorMinimo, moneda }: MontoDto): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda }).format(valorMinimo / 100);
}
