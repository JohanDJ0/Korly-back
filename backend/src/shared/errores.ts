/**
 * Error de dominio con un `codigo` estable, pensado para que la futura
 * capa HTTP lo traduzca directo a una respuesta (ver el esquema `Error`
 * en docs/openapi.yaml: `{ codigo, mensaje }`). No hay capa HTTP todavía
 * — hoy estos errores solo se ven en tests y en callers en proceso —
 * pero el código ya sigue el contrato acordado en vez de inventar uno
 * temporal que habría que traducir después.
 */
export class ErrorDominio extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string
  ) {
    super(mensaje);
    this.name = 'ErrorDominio';
  }
}

/**
 * Código `23505` de Postgres (`unique_violation`). Usado por los
 * find-or-create con reintento por `SAVEPOINT` (crearPeriodo,
 * materializar-arrastre.ts) para distinguir "otra transacción concurrente
 * ganó la carrera" de cualquier otro error real. El driver no envuelve
 * el error de la misma forma según el camino (`tx.insert().values()` vs
 * `tx.execute(sql\`...\`)`), de ahí el doble chequeo en `.code` y
 * `.cause.code`.
 */
export function esViolacionDeIndiceUnico(error: unknown): boolean {
  const codigo = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return codigo === '23505';
}
