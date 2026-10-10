import { getTableName } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { atajosGasto } from '../../db/schema/atajos-gasto.js';
import { cargosTarjeta, pagosTarjeta } from '../../db/schema/cargos-tarjeta.js';
import { categorias } from '../../db/schema/categorias.js';
import { resumenes } from '../../db/schema/cierre.js';
import { gastosRecurrentes } from '../../db/schema/gastos-recurrentes.js';
import { gastos } from '../../db/schema/gastos.js';
import { identidadesExternas, usuarios } from '../../db/schema/identidad.js';
import { ingresos } from '../../db/schema/ingresos.js';
import { asientos, cuentas, movimientos } from '../../db/schema/ledger.js';
import { metas } from '../../db/schema/metas.js';
import { arrastres } from '../../db/schema/arrastres.js';
import { periodos } from '../../db/schema/periodos.js';
import { recordatoriosEnviados } from '../../db/schema/recordatorios.js';
import { tarjetas } from '../../db/schema/tarjetas.js';

export interface TablaDelTenant {
  nombre: string;
  tabla: PgTable;
  columnaTenant: PgColumn;
}

function tabla(definicion: PgTable & { tenantId: PgColumn }): TablaDelTenant {
  return { nombre: getTableName(definicion), tabla: definicion, columnaTenant: definicion.tenantId };
}

/**
 * Toda tabla con `tenant_id` — **única fuente de verdad** de qué datos
 * pertenecen a un usuario, usada tanto para exportarlos (derecho de
 * acceso) como para borrarlos (derecho de cancelación, ADR-008). Una
 * prueba compara esta lista contra el catálogo de Postgres y falla si
 * alguna tabla con `tenant_id` no está aquí: agregar una tabla nueva sin
 * decidir qué pasa con ella al exportar/eliminar una cuenta no pasa CI.
 *
 * **El orden es el de la purga: hijos antes que padres**, porque las
 * llaves foráneas no tienen `ON DELETE CASCADE`. `movimientos` se
 * referencia a sí misma (`movimiento_revertido_id`), pero un solo DELETE
 * que quita todas sus filas es válido: Postgres revisa la llave al
 * terminar la sentencia, no fila por fila. La fila de `tenants` (cuya
 * columna es `id`, no `tenant_id`) se borra aparte, al final.
 */
export const TABLAS_DEL_TENANT_EN_ORDEN_DE_PURGA: readonly TablaDelTenant[] = [
  tabla(pagosTarjeta),
  tabla(cargosTarjeta),
  tabla(arrastres),
  tabla(resumenes),
  tabla(gastos),
  tabla(ingresos),
  tabla(gastosRecurrentes),
  tabla(atajosGasto), // apunta a categorias: antes que ella
  tabla(recordatoriosEnviados),
  tabla(asientos),
  tabla(movimientos),
  tabla(tarjetas),
  tabla(metas),
  tabla(periodos),
  tabla(cuentas),
  tabla(categorias),
  tabla(identidadesExternas),
  tabla(usuarios),
];
