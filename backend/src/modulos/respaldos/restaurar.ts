import type { Sql, TransactionSql } from 'postgres';
import { conteosDe, nombreCompleto, type RespaldoLeido, type TablaRespaldo } from './contenido.js';
import { referenciaDe } from './volcar.js';

/**
 * Restauración de un respaldo en una base de datos DESTINO que ya tiene la estructura (las migraciones aplicadas) y
 * está vacía. Todo ocurre en una sola transacción: si algo falla, no queda nada a medias.
 *
 * Por qué se desactivan los triggers durante la carga (`session_replication_role = replica`): los del ledger
 * (`asientos_*`, `movimientos_*`) están hechos para rechazar cambios y validar CADA escritura nueva, y aquí se
 * reinsertan filas que ya fueron validadas cuando nacieron. No se sacrifica la garantía: al terminar se vuelve a
 * comprobar que cada movimiento suma cero, y los triggers siguen instalados para todo lo que ocurra después.
 * Eso requiere un rol con privilegio para cambiar esa opción (superusuario; el rol `postgres` de Supabase la tiene).
 *
 * Esta función no decide a qué base apuntar: quien la llama le da la conexión. Los scripts nunca usan por omisión la
 * conexión de producción para restaurar (ver `scripts/restaurar-respaldo.ts`).
 */

export interface OpcionesRestauracion {
  /**
   * Crea (sin llaves ni restricciones) las tablas que el destino no tenga, con las columnas del respaldo. Solo para
   * pruebas de restauración en una base desechable (p. ej. `auth.users` de Supabase, que un Postgres común no trae);
   * nunca para una restauración real, donde falta de tabla significa que no se aplicaron las migraciones.
   */
  crearTablasFaltantes?: boolean;
  /** Permite cargar en tablas que ya tienen filas. Por omisión se rechaza para no mezclar ni duplicar datos. */
  permitirDestinoConDatos?: boolean;
}

export class RestauracionError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'RestauracionError';
  }
}

const FILAS_POR_LOTE = 500;
const ident = (nombre: string) => `"${nombre.replace(/"/g, '""')}"`;
const TIPO_SEGURO = /^[\w\s,.()[\]"]+$/;

type Tx = TransactionSql;

async function existeTabla(tx: Tx, referencia: string): Promise<boolean> {
  const [fila] = await tx.unsafe<{ existe: boolean }[]>('select to_regclass($1::text) is not null as existe', [referencia]);
  return fila?.existe === true;
}

/** Hijas después de sus padres, según las llaves foráneas del DESTINO (con la carga sin triggers no es obligatorio, pero deja el orden lógico). */
async function ordenarPorDependencias(tx: Tx, tablas: TablaRespaldo[]): Promise<TablaRespaldo[]> {
  const relaciones = await tx.unsafe<{ hijo: string; padre: string }[]>(
    `select ch.relnamespace::regnamespace::text || '.' || ch.relname as hijo, cp.relnamespace::regnamespace::text || '.' || cp.relname as padre
       from pg_constraint k join pg_class ch on ch.oid = k.conrelid join pg_class cp on cp.oid = k.confrelid
      where k.contype = 'f' and k.conrelid <> k.confrelid`
  );
  const pendientes = new Map(tablas.map((t) => [nombreCompleto(t.definicion), t]));
  const padresDe = (nombre: string) => relaciones.filter((r) => r.hijo.replace(/"/g, '') === nombre).map((r) => r.padre.replace(/"/g, ''));
  const orden: TablaRespaldo[] = [];
  while (pendientes.size > 0) {
    const listas = [...pendientes.keys()].filter((nombre) => padresDe(nombre).every((padre) => !pendientes.has(padre) || padre === nombre));
    // Un ciclo entre tablas no debería existir; si hay uno, se sigue en el orden del respaldo en vez de quedarse atorado.
    const siguientes = listas.length > 0 ? listas : [...pendientes.keys()].slice(0, 1);
    for (const nombre of siguientes) {
      orden.push(pendientes.get(nombre)!);
      pendientes.delete(nombre);
    }
  }
  return orden;
}

async function prepararDestino(tx: Tx, tabla: TablaRespaldo, opciones: OpcionesRestauracion): Promise<void> {
  const { esquema, columnas } = tabla.definicion;
  const referencia = referenciaDe(tabla.definicion);
  const etiqueta = nombreCompleto(tabla.definicion);

  if (!(await existeTabla(tx, referencia))) {
    if (!opciones.crearTablasFaltantes) {
      throw new RestauracionError(`La tabla ${etiqueta} no existe en la base destino. Aplica primero las migraciones (npm run db:migrate) y vuelve a intentar.`);
    }
    for (const c of columnas) {
      if (!TIPO_SEGURO.test(c.tipo)) throw new RestauracionError(`El tipo de la columna ${c.nombre} de ${etiqueta} no es válido.`);
    }
    await tx.unsafe(`create schema if not exists ${ident(esquema)}`);
    await tx.unsafe(`create table ${referencia} (${columnas.map((c) => `${ident(c.nombre)} ${c.tipo}`).join(', ')})`);
  } else {
    const existentes = await tx.unsafe<{ nombre: string }[]>(
      `select attname as nombre from pg_attribute where attrelid = $1::text::regclass and attnum > 0 and not attisdropped`,
      [referencia]
    );
    const nombres = new Set(existentes.map((c) => c.nombre));
    const faltantes = columnas.filter((c) => !nombres.has(c.nombre)).map((c) => c.nombre);
    if (faltantes.length > 0) {
      throw new RestauracionError(
        `La tabla ${etiqueta} del destino no tiene las columnas ${faltantes.join(', ')}: el respaldo es de una versión más nueva de la estructura. Aplica las migraciones que faltan.`
      );
    }
  }

  if (!opciones.permitirDestinoConDatos && tabla.filas.length > 0) {
    const [fila] = await tx.unsafe<{ hay: boolean }[]>(`select exists(select 1 from ${referencia}) as hay`);
    if (fila?.hay) {
      throw new RestauracionError(`La tabla ${etiqueta} del destino ya tiene datos. Una restauración solo se hace sobre una base vacía.`);
    }
  }
}

async function cargarTabla(tx: Tx, tabla: TablaRespaldo): Promise<void> {
  const referencia = referenciaDe(tabla.definicion);
  const lista = tabla.definicion.columnas.map((c) => ident(c.nombre)).join(', ');
  const insertar = `insert into ${referencia} (${lista}) select ${lista} from jsonb_populate_recordset(null::${referencia}, $1::text::jsonb)`;
  for (let i = 0; i < tabla.filas.length; i += FILAS_POR_LOTE) {
    // `::text::jsonb`: el texto viaja tal cual (sin que el cliente lo vuelva a codificar) y Postgres lo interpreta.
    await tx.unsafe(insertar, [`[${tabla.filas.slice(i, i + FILAS_POR_LOTE).join(',')}]`]);
  }
}

/** Con los triggers apagados nadie validó el balance al insertar, así que se comprueba aquí, sobre lo que quedó en la base. */
async function verificarLedger(tx: Tx): Promise<void> {
  if (!(await existeTabla(tx, '"public"."asientos"'))) return;
  const [fila] = await tx.unsafe<{ n: number }[]>(
    `select count(*)::int as n from (
       select movimiento_id from "public"."asientos" group by movimiento_id
       having sum(monto_valor_minimo) <> 0 or count(distinct moneda) > 1
     ) desbalanceados`
  );
  if ((fila?.n ?? 0) > 0) throw new RestauracionError(`Después de restaurar, ${fila?.n} movimientos del ledger no suman cero: el respaldo no es confiable.`);
}

/** Restaura `respaldo` en la base de `sql`. Devuelve las filas que quedaron en cada tabla (ya comprobadas contra el respaldo). */
export async function restaurarRespaldo(sql: Sql, respaldo: RespaldoLeido, opciones: OpcionesRestauracion = {}): Promise<Record<string, number>> {
  const esperados = conteosDe(respaldo);
  const obtenidos: Record<string, number> = {};

  await sql.begin(async (tx) => {
    try {
      await tx.unsafe('set local session_replication_role = replica');
    } catch (error) {
      throw new RestauracionError(
        `El rol con el que te conectaste no puede desactivar triggers durante la carga (session_replication_role). Usa el rol administrador (postgres). Detalle: ${(error as Error).message}`
      );
    }

    const ordenadas = await ordenarPorDependencias(tx, respaldo.tablas);
    for (const tabla of respaldo.tablas) await prepararDestino(tx, tabla, opciones);
    for (const tabla of ordenadas) await cargarTabla(tx, tabla);

    for (const tabla of respaldo.tablas) {
      const nombre = nombreCompleto(tabla.definicion);
      const [fila] = await tx.unsafe<{ n: number }[]>(`select count(*)::int as n from ${referenciaDe(tabla.definicion)}`);
      obtenidos[nombre] = fila?.n ?? 0;
      // Con "destino con datos" el total incluye lo que ya había; sin eso debe ser exactamente lo respaldado.
      const coincide = opciones.permitirDestinoConDatos ? obtenidos[nombre]! >= esperados[nombre]! : obtenidos[nombre] === esperados[nombre];
      if (!coincide) throw new RestauracionError(`En ${nombre} quedaron ${obtenidos[nombre]} filas y el respaldo tenía ${esperados[nombre]}.`);
    }
    await verificarLedger(tx);
  });

  return obtenidos;
}
