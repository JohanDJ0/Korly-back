/**
 * Entrada interactiva de los scripts de respaldo. La contraseña se lee SIN mostrarla en pantalla y nunca se imprime ni
 * se guarda; si estás automatizando, puedes pasarla en la variable de entorno `KORLY_RESPALDO_CLAVE` (cuidado: queda
 * en el entorno de ese proceso).
 */
import { createInterface } from 'node:readline/promises';

export function leerOculto(pregunta: string): Promise<string> {
  const entrada = process.stdin;
  if (!entrada.isTTY || typeof entrada.setRawMode !== 'function') {
    throw new Error('No hay una terminal interactiva para pedir la contraseña. Defínela en la variable de entorno KORLY_RESPALDO_CLAVE.');
  }
  return new Promise((resolver, rechazar) => {
    process.stdout.write(pregunta);
    let texto = '';
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    const terminar = () => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.removeListener('data', alRecibir);
      process.stdout.write('\n');
    };
    const alRecibir = (tecla: string) => {
      for (const caracter of tecla) {
        if (caracter === '\r' || caracter === '\n' || caracter === '\u0004') {
          terminar();
          resolver(texto);
          return;
        }
        if (caracter === '\u0003') {
          terminar();
          rechazar(new Error('Cancelado.'));
          return;
        }
        if (caracter === '\u007f' || caracter === '\b') texto = [...texto].slice(0, -1).join('');
        else texto += caracter;
      }
    };
    entrada.on('data', alRecibir);
  });
}

/** Contraseña del respaldo: del entorno, o pedida (dos veces si se está creando uno nuevo, para evitar un error de dedo). */
export async function obtenerClave(opciones: { confirmar: boolean }): Promise<string> {
  const delEntorno = process.env.KORLY_RESPALDO_CLAVE;
  if (delEntorno) return delEntorno;
  const clave = await leerOculto('Contraseña del respaldo: ');
  if (opciones.confirmar) {
    const otra = await leerOculto('Repítela para confirmar: ');
    if (otra !== clave) throw new Error('Las dos contraseñas no coinciden. No se hizo nada.');
  }
  return clave;
}

export async function preguntar(pregunta: string): Promise<string> {
  const lectura = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await lectura.question(pregunta)).trim();
  } finally {
    lectura.close();
  }
}

export function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
