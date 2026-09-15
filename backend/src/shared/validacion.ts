const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hallazgo del pase de QA/UX: cualquier lookup que compara una columna
 * `uuid` contra un valor que llega de la URL (o del body) sin pasar por
 * esto, si el valor no tiene forma de UUID, Postgres rechaza la consulta
 * entera con "invalid input syntax for type uuid" — un error que no es
 * `ErrorDominio`, así que cae al manejador genérico de 500 en vez de
 * devolver el mismo "no encontrado" que ya da un UUID bien formado pero
 * inexistente. Mismo criterio que ya aplica el resto del sistema para
 * BOLA (`obtenerPeriodoPorIdTx`, etc.): "malformado" y "no existe" deben
 * verse exactamente igual desde afuera.
 */
export function esUuidValido(valor: string): boolean {
  return FORMATO_UUID.test(valor);
}
