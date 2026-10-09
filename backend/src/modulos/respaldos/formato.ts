import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

/**
 * Archivo de respaldo cifrado (`.korlybak`). Un respaldo contiene datos financieros y correos de personas reales
 * (y los hashes de contraseña de Supabase Auth), así que nunca se guarda en claro: el contenido se comprime con gzip y
 * se cifra con AES-256-GCM, con la llave derivada de una contraseña con scrypt. GCM además detecta cualquier cambio al
 * archivo (un solo byte alterado impide abrirlo), así que "se abre" también significa "está íntegro".
 *
 * Estructura (todo lo de antes del texto cifrado va autenticado como datos asociados):
 *   8 bytes   "KORLYBAK"
 *   1 byte    versión del formato
 *   1 byte    log2(N) de scrypt
 *   1 byte    r de scrypt
 *   1 byte    p de scrypt
 *   16 bytes  sal
 *   12 bytes  IV
 *   n bytes   texto cifrado
 *   16 bytes  etiqueta de autenticación
 *
 * Solo se usa la biblioteca estándar de Node (sin gpg ni openssl en la máquina) para que funcione igual en Windows.
 */

const MAGIA = Buffer.from('KORLYBAK', 'ascii');
const VERSION = 1;
const LOG2_N = 16; // 64 MiB de memoria: lento a propósito para quien intente adivinar la contraseña
const R = 8;
const P = 1;
const LONGITUD_SAL = 16;
const LONGITUD_IV = 12;
const LONGITUD_ETIQUETA = 16;
const LONGITUD_ENCABEZADO = MAGIA.length + 4 + LONGITUD_SAL + LONGITUD_IV;
const MEMORIA_MAXIMA = 512 * 1024 * 1024;

export const LONGITUD_MINIMA_CLAVE = 12;

export class RespaldoInvalidoError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'RespaldoInvalidoError';
  }
}

/** La contraseña protege todos los respaldos: una corta o vacía los dejaría casi en claro. */
export function validarClave(clave: string): void {
  if (clave.length < LONGITUD_MINIMA_CLAVE) {
    throw new RespaldoInvalidoError(`La contraseña del respaldo debe tener al menos ${LONGITUD_MINIMA_CLAVE} caracteres.`);
  }
}

function derivarLlave(clave: string, sal: Buffer, log2N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    scrypt(clave.normalize('NFC'), sal, 32, { N: 2 ** log2N, r, p, maxmem: MEMORIA_MAXIMA }, (error, llave) => {
      if (error) rechazar(error);
      else resolver(llave);
    });
  });
}

/** Comprime y cifra `plano`. Cada llamada usa sal e IV nuevos, así que el mismo contenido nunca da el mismo archivo. */
export async function cifrarRespaldo(plano: Buffer, clave: string): Promise<Buffer> {
  validarClave(clave);
  const sal = randomBytes(LONGITUD_SAL);
  const iv = randomBytes(LONGITUD_IV);
  const encabezado = Buffer.concat([MAGIA, Buffer.from([VERSION, LOG2_N, R, P]), sal, iv]);

  const llave = await derivarLlave(clave, sal, LOG2_N, R, P);
  const cifrador = createCipheriv('aes-256-gcm', llave, iv, { authTagLength: LONGITUD_ETIQUETA });
  cifrador.setAAD(encabezado);
  const cifrado = Buffer.concat([cifrador.update(gzipSync(plano)), cifrador.final()]);

  return Buffer.concat([encabezado, cifrado, cifrador.getAuthTag()]);
}

/** Abre un archivo hecho por `cifrarRespaldo`. Contraseña incorrecta y archivo alterado se ven igual (no se puede distinguirlos). */
export async function descifrarRespaldo(archivo: Buffer, clave: string): Promise<Buffer> {
  if (archivo.length < LONGITUD_ENCABEZADO + LONGITUD_ETIQUETA || !archivo.subarray(0, MAGIA.length).equals(MAGIA)) {
    throw new RespaldoInvalidoError('Este archivo no es un respaldo de Korly (o está incompleto).');
  }
  const version = archivo[MAGIA.length];
  if (version !== VERSION) {
    throw new RespaldoInvalidoError(`Versión de respaldo no compatible (${version ?? '?'}). Usa una versión más nueva de Korly para abrirlo.`);
  }
  const log2N = archivo[MAGIA.length + 1] ?? 0;
  const r = archivo[MAGIA.length + 2] ?? 0;
  const p = archivo[MAGIA.length + 3] ?? 0;
  // Un encabezado alterado no debe poder pedir una cantidad absurda de memoria antes de fallar la autenticación.
  if (log2N < 10 || log2N > 17 || r < 1 || r > 16 || p < 1 || p > 4) {
    throw new RespaldoInvalidoError('El encabezado del respaldo no es válido.');
  }

  const inicioSal = MAGIA.length + 4;
  const sal = archivo.subarray(inicioSal, inicioSal + LONGITUD_SAL);
  const iv = archivo.subarray(inicioSal + LONGITUD_SAL, LONGITUD_ENCABEZADO);
  const encabezado = archivo.subarray(0, LONGITUD_ENCABEZADO);
  const cifrado = archivo.subarray(LONGITUD_ENCABEZADO, archivo.length - LONGITUD_ETIQUETA);
  const etiqueta = archivo.subarray(archivo.length - LONGITUD_ETIQUETA);

  const llave = await derivarLlave(clave, sal, log2N, r, p);
  const descifrador = createDecipheriv('aes-256-gcm', llave, iv, { authTagLength: LONGITUD_ETIQUETA });
  descifrador.setAAD(encabezado);
  descifrador.setAuthTag(etiqueta);
  try {
    return gunzipSync(Buffer.concat([descifrador.update(cifrado), descifrador.final()]));
  } catch {
    throw new RespaldoInvalidoError('No se pudo abrir el respaldo: la contraseña es incorrecta o el archivo está dañado.');
  }
}
