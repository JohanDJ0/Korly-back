// Copia de frontend/src/lib/dinero.ts más la conversión de pesos a centavos que la web hace dentro de FormularioGasto.
// Fase 3: pasa a un paquete compartido entre la web y la app.

export interface MontoDto {
  valorMinimo: number;
  moneda: string;
}

/** Entero en centavos → texto para la persona (ADR-002: un solo lugar convierte entre entero y presentación). */
export function formatearMonto({ valorMinimo, moneda }: MontoDto): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda }).format(valorMinimo / 100);
}

/**
 * Lo que la persona teclea ("45", "45.5", "1,200.50") → centavos, o `null` si no es un monto positivo válido.
 * Se trabaja con el texto, no con `parseFloat` * 100, para no arrastrar errores de punto flotante.
 */
export function pesosACentavos(texto: string): number | null {
  const limpio = texto.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(limpio)) return null;
  const [enteros, decimales = ''] = limpio.split('.');
  const centavos = Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
  return centavos > 0 ? centavos : null;
}
