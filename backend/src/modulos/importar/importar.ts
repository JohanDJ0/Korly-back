import { and, eq } from 'drizzle-orm';
import { categorias } from '../../db/schema/categorias.js';
import { gastos } from '../../db/schema/gastos.js';
import { ingresos } from '../../db/schema/ingresos.js';
import { registrarMovimientoTx } from '../ledger/registrar-movimiento.js';
import { obtenerPeriodoPorIdTx } from '../periodos/crear-periodo.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { parsearFilasCsv, parsearMontoDecimalCsv } from '../../shared/csv.js';
import { ErrorDominio } from '../../shared/errores.js';
import { esFechaIsoValida } from '../../shared/fechas.js';

export interface ErrorImportacion {
  /** 1-indexado sobre las filas de datos, sin contar el encabezado — la línea que el usuario vería si abriera el CSV en un editor de texto (encabezado + esta fila). */
  fila: number;
  mensaje: string;
}

export interface ResultadoImportacion {
  creados: number;
  errores: ErrorImportacion[];
}

interface FilaParseada {
  numeroFila: number;
  fecha: string;
  montoTexto: string;
  moneda: string;
  categoriaNombre: string;
  nota: string;
}

/**
 * Encuentra las columnas por nombre, no por posición — un CSV externo
 * (banco, Excel) no tiene por qué ordenarlas igual que las exporta este
 * sistema. `fecha` y `monto` son las únicas obligatorias; el resto
 * quedan vacías si la columna no existe.
 */
function leerEncabezado(filas: string[][]): { idxFecha: number; idxMonto: number; idxMoneda: number; idxCategoria: number; idxNota: number } {
  if (filas.length === 0) {
    throw new ErrorDominio('VALIDACION', 'El archivo CSV está vacío');
  }
  const encabezado = filas[0]!.map((columna) => columna.trim().toLowerCase());
  const idxFecha = encabezado.indexOf('fecha');
  const idxMonto = encabezado.indexOf('monto');
  if (idxFecha === -1 || idxMonto === -1) {
    throw new ErrorDominio('VALIDACION', "El CSV debe tener al menos las columnas 'fecha' y 'monto'");
  }
  return {
    idxFecha,
    idxMonto,
    idxMoneda: encabezado.indexOf('moneda'),
    idxCategoria: encabezado.indexOf('categoria'),
    idxNota: encabezado.indexOf('nota'),
  };
}

function extraerFilasDeDatos(filas: string[][]): FilaParseada[] {
  const { idxFecha, idxMonto, idxMoneda, idxCategoria, idxNota } = leerEncabezado(filas);

  return filas.slice(1).map((columnas, indice) => ({
    numeroFila: indice + 1,
    fecha: (columnas[idxFecha] ?? '').trim(),
    montoTexto: (columnas[idxMonto] ?? '').trim(),
    moneda: (idxMoneda === -1 ? '' : (columnas[idxMoneda] ?? '')).trim() || 'MXN',
    categoriaNombre: (idxCategoria === -1 ? '' : (columnas[idxCategoria] ?? '')).trim(),
    nota: (idxNota === -1 ? '' : (columnas[idxNota] ?? '')).trim(),
  }));
}

/**
 * `null` = fecha/monto inválidos en la fila misma (error de formato,
 * responsabilidad de quien armó el CSV); `'fuera_de_rango'` = la fecha
 * es válida pero no le toca al periodo activo — la única política de
 * alcance que existe hoy (ver backend/README.md, "Importación": las
 * filas de periodos ya cerrados se rechazan, no se generan como ajuste,
 * a diferencia de editar/eliminar un gasto existente).
 */
function validarFila(
  fila: FilaParseada,
  periodo: { fechaInicio: string; fechaFin: string }
): { montoValorMinimo: bigint } | 'fecha_invalida' | 'fuera_de_rango' | 'monto_invalido' {
  if (!esFechaIsoValida(fila.fecha)) return 'fecha_invalida';
  if (fila.fecha < periodo.fechaInicio || fila.fecha > periodo.fechaFin) return 'fuera_de_rango';

  const montoValorMinimo = parsearMontoDecimalCsv(fila.montoTexto);
  if (montoValorMinimo === null || montoValorMinimo <= 0n) return 'monto_invalido';

  return { montoValorMinimo };
}

function mensajeDeError(resultado: 'fecha_invalida' | 'fuera_de_rango' | 'monto_invalido', periodo: { fechaInicio: string; fechaFin: string }): string {
  switch (resultado) {
    case 'fecha_invalida':
      return "La columna 'fecha' debe tener formato YYYY-MM-DD y ser una fecha real";
    case 'fuera_de_rango':
      return `La fecha no cae dentro del periodo activo (${periodo.fechaInicio} a ${periodo.fechaFin})`;
    case 'monto_invalido':
      return "La columna 'monto' debe ser un número positivo (p. ej. 150.50)";
  }
}

async function mapaCategoriasPorNombreTx(tx: Ejecutor, tenantId: string): Promise<Map<string, string>> {
  const filas = await tx.select({ id: categorias.id, nombre: categorias.nombre }).from(categorias).where(eq(categorias.tenantId, tenantId));
  return new Map(filas.map((f) => [f.nombre.toLowerCase(), f.id]));
}

export async function importarGastosCsv(
  tenantId: string,
  periodoId: string,
  csvTexto: string,
  fechaReferencia: Date = new Date()
): Promise<ResultadoImportacion> {
  return conTenant(tenantId, async (tx) => {
    const periodo = await obtenerPeriodoPorIdTx(tx, tenantId, periodoId, fechaReferencia);
    if (!periodo) throw new ErrorDominio('PERIODO_NO_ENCONTRADO', 'El periodo especificado no existe');
    if (periodo.estado !== 'activo') throw new ErrorDominio('PERIODO_NO_ACTIVO', 'Solo se puede importar contra el periodo activo');

    const filasDeDatos = extraerFilasDeDatos(parsearFilasCsv(csvTexto));
    const categoriasPorNombre = await mapaCategoriasPorNombreTx(tx, tenantId);

    const errores: ErrorImportacion[] = [];
    let creados = 0;

    for (const fila of filasDeDatos) {
      const validado = validarFila(fila, periodo);
      if (validado === 'fecha_invalida' || validado === 'fuera_de_rango' || validado === 'monto_invalido') {
        errores.push({ fila: fila.numeroFila, mensaje: mensajeDeError(validado, periodo) });
        continue;
      }

      const categoriaId = fila.categoriaNombre ? (categoriasPorNombre.get(fila.categoriaNombre.toLowerCase()) ?? null) : null;

      const { movimientoId } = await registrarMovimientoTx(tx, {
        tenantId,
        tipo: 'gasto',
        moneda: fila.moneda,
        fechaEfectiva: fila.fecha,
        nota: fila.nota || undefined,
        partidas: [
          { cuentaId: periodo.cuentaId, montoValorMinimo: -validado.montoValorMinimo },
          { cuentaId: null, montoValorMinimo: validado.montoValorMinimo },
        ],
      });

      await tx.insert(gastos).values({ tenantId, periodoId: periodo.id, movimientoId, categoriaId });
      creados++;
    }

    return { creados, errores };
  });
}

export async function importarIngresosCsv(
  tenantId: string,
  periodoId: string,
  csvTexto: string,
  fechaReferencia: Date = new Date()
): Promise<ResultadoImportacion> {
  return conTenant(tenantId, async (tx) => {
    const periodo = await obtenerPeriodoPorIdTx(tx, tenantId, periodoId, fechaReferencia);
    if (!periodo) throw new ErrorDominio('PERIODO_NO_ENCONTRADO', 'El periodo especificado no existe');
    if (periodo.estado !== 'activo') throw new ErrorDominio('PERIODO_NO_ACTIVO', 'Solo se puede importar contra el periodo activo');

    const filasDeDatos = extraerFilasDeDatos(parsearFilasCsv(csvTexto));

    const errores: ErrorImportacion[] = [];
    let creados = 0;

    for (const fila of filasDeDatos) {
      const validado = validarFila(fila, periodo);
      if (validado === 'fecha_invalida' || validado === 'fuera_de_rango' || validado === 'monto_invalido') {
        errores.push({ fila: fila.numeroFila, mensaje: mensajeDeError(validado, periodo) });
        continue;
      }

      const { movimientoId } = await registrarMovimientoTx(tx, {
        tenantId,
        tipo: 'ingreso',
        moneda: fila.moneda,
        fechaEfectiva: fila.fecha,
        nota: fila.nota || undefined,
        partidas: [
          { cuentaId: periodo.cuentaId, montoValorMinimo: validado.montoValorMinimo },
          { cuentaId: null, montoValorMinimo: -validado.montoValorMinimo },
        ],
      });

      await tx.insert(ingresos).values({ tenantId, periodoId: periodo.id, movimientoId });
      creados++;
    }

    return { creados, errores };
  });
}
