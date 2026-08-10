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
