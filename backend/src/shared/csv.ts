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

/**
 * Operación inversa de `filaCsv`/`escaparCsv`, para importación
 * (backend/README.md, "Importación"). A diferencia de escribir un CSV
 * propio, uno de entrada puede venir de Excel, un banco, o cualquier
 * fuente externa — sí puede traer campos entrecomillados con comas o
 * saltos de línea reales adentro, así que un `split(',')`/`split('\n')`
 * ingenuo rompería en silencio (leería mal una fila en vez de fallar
 * claramente). Máquina de estados carácter por carácter, RFC 4180:
 * dentro de un campo entre comillas, `""` es una comilla literal y una
 * coma o salto de línea NO terminan el campo.
 *
 * Quita un BOM inicial (`﻿`) si existe — común en CSVs exportados
 * desde Excel — y trata tanto `\r\n` como `\n` como fin de fila.
 */
export function parsearFilasCsv(texto: string): string[][] {
  const contenido = texto.startsWith('﻿') ? texto.slice(1) : texto;
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let dentroDeComillas = false;

  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i];

    if (dentroDeComillas) {
      if (c === '"') {
        if (contenido[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      dentroDeComillas = true;
    } else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && contenido[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }

  // Última fila sin salto de línea final — no descartarla.
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  // Líneas en blanco sueltas (al final del archivo, o entre filas) no
  // cuentan como datos — una sola columna vacía es indistinguible de
  // "no había nada aquí".
  return filas.filter((f) => !(f.length === 1 && f[0] === ''));
}

/**
 * Acepta "150", "150.5" o "150.50" — nunca negativo ni notación
 * científica. `null` si el texto no tiene esa forma exacta, para que el
 * caller distinga "monto inválido" de "monto cero o negativo" con un
 * mensaje de error distinto.
 */
export function parsearMontoDecimalCsv(texto: string): bigint | null {
  const coincidencia = /^(\d+)(?:\.(\d{1,2}))?$/.exec(texto.trim());
  if (!coincidencia) return null;
  const pesos = BigInt(coincidencia[1]!);
  const centavos = BigInt((coincidencia[2] ?? '').padEnd(2, '0') || '0');
  return pesos * 100n + centavos;
}
