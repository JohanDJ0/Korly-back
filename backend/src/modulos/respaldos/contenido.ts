import { RespaldoInvalidoError } from './formato.js';

/**
 * Contenido (ya descifrado) de un respaldo: texto en líneas, una por registro, para poder escribirlo y leerlo sin
 * armar nunca un documento gigante en memoria y SIN convertir los números a `number` de JavaScript (los montos son
 * `bigint` en la base y pasarlos por `JSON.parse` perdería precisión; las filas viajan como el texto JSON que
 * produce Postgres y regresan a Postgres tal cual).
 *
 *   M{...}   manifiesto (primera línea)
 *   T{...}   empieza una tabla: esquema, nombre y columnas con su tipo
 *   R{...}   una fila de la tabla anterior (el JSON de Postgres, en una sola línea)
 *   F{...}   cierre: cuántas filas tiene cada tabla — su ausencia delata un archivo cortado
 */

export const VERSION_CONTENIDO = 1;

export interface ColumnaRespaldo {
  nombre: string;
  tipo: string;
}

export interface DefinicionTabla {
  esquema: string;
  nombre: string;
  columnas: ColumnaRespaldo[];
}

export interface ManifiestoRespaldo {
  korly_respaldo: number;
  creado_en: string;
  servidor: string;
  migraciones: number;
  ultima_migracion: string | null;
}

export interface TablaRespaldo {
  definicion: DefinicionTabla;
  /** El JSON de cada fila, sin interpretar. */
  filas: string[];
}

export interface RespaldoLeido {
  manifiesto: ManifiestoRespaldo;
  tablas: TablaRespaldo[];
}

/** `esquema.tabla`, como se muestra y como se usa de llave en los conteos. */
export function nombreCompleto(tabla: { esquema: string; nombre: string }): string {
  return `${tabla.esquema}.${tabla.nombre}`;
}

function jsonDe<T>(linea: string, numero: number): T {
  try {
    return JSON.parse(linea.slice(1)) as T;
  } catch {
    throw new RespaldoInvalidoError(`El respaldo está dañado (línea ${numero}).`);
  }
}

/** Lee y valida el contenido: estructura completa, cierre presente y conteos que cuadran con las filas leídas. */
export function parsearRespaldo(contenido: Buffer): RespaldoLeido {
  const lineas = contenido.toString('utf8').split('\n');
  if (lineas.at(-1) === '') lineas.pop();

  const primera = lineas[0];
  if (!primera?.startsWith('M')) throw new RespaldoInvalidoError('El respaldo no empieza con su manifiesto.');
  const manifiesto = jsonDe<ManifiestoRespaldo>(primera, 1);
  if (manifiesto.korly_respaldo !== VERSION_CONTENIDO) {
    throw new RespaldoInvalidoError(`Contenido de respaldo no compatible (versión ${manifiesto.korly_respaldo}).`);
  }

  const tablas: TablaRespaldo[] = [];
  let actual: TablaRespaldo | undefined;
  let cierre: { tablas: Record<string, number> } | undefined;

  for (let i = 1; i < lineas.length; i++) {
    const linea = lineas[i] ?? '';
    if (cierre) throw new RespaldoInvalidoError(`El respaldo tiene contenido después de su cierre (línea ${i + 1}).`);
    switch (linea[0]) {
      case 'T':
        actual = { definicion: jsonDe<DefinicionTabla>(linea, i + 1), filas: [] };
        tablas.push(actual);
        break;
      case 'R':
        if (!actual) throw new RespaldoInvalidoError(`Una fila aparece antes de su tabla (línea ${i + 1}).`);
        actual.filas.push(linea.slice(1));
        break;
      case 'F':
        cierre = jsonDe<{ tablas: Record<string, number> }>(linea, i + 1);
        break;
      default:
        throw new RespaldoInvalidoError(`El respaldo está dañado (línea ${i + 1}).`);
    }
  }

  if (!cierre) throw new RespaldoInvalidoError('El respaldo está incompleto: falta su cierre (el archivo se cortó).');
  const esperadas = Object.keys(cierre.tablas).sort();
  const nombresLeidos = tablas.map((t) => nombreCompleto(t.definicion)).sort();
  if (esperadas.join(',') !== nombresLeidos.join(',')) {
    throw new RespaldoInvalidoError('Las tablas del respaldo no coinciden con su cierre.');
  }
  for (const tabla of tablas) {
    const nombre = nombreCompleto(tabla.definicion);
    if (cierre.tablas[nombre] !== tabla.filas.length) {
      throw new RespaldoInvalidoError(`La tabla ${nombre} tiene ${tabla.filas.length} filas y debería tener ${cierre.tablas[nombre]}.`);
    }
  }
  return { manifiesto, tablas };
}

/** Filas por tabla de un respaldo ya leído. */
export function conteosDe(respaldo: RespaldoLeido): Record<string, number> {
  return Object.fromEntries(respaldo.tablas.map((t) => [nombreCompleto(t.definicion), t.filas.length]));
}
