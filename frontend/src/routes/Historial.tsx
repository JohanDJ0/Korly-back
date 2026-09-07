import { Link, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { FilaGasto } from '@/components/FilaGasto';
import { FilaIngreso } from '@/components/FilaIngreso';
import { useGastos } from '@/hooks/use-gastos';
import { useIngresos } from '@/hooks/use-ingresos';
import { usePeriodoActivo } from '@/hooks/use-periodo-activo';
import { usePeriodos } from '@/hooks/use-periodos';
import { ApiError } from '@/lib/api';
import { formatearRangoFechas } from '@/lib/fechas';

/**
 * Sin `:periodoId` en la URL, muestra el periodo activo (comportamiento
 * de siempre). Con uno, muestra ESE periodo — cerrado o no — vía
 * `GET /periodos/:id/{ingresos,gastos}`, que ya aceptaban cualquier
 * `periodoId` desde que se construyeron; lo único que faltaba era
 * `GET /periodos` (extensión sobre openapi.yaml, ver backend/README.md)
 * para poder enlazar a ellos. Editar/eliminar un gasto de un periodo ya
 * cerrado sigue funcionando igual que siempre — el backend decide solo
 * a qué periodo va a parar la corrección (ver "Editar y eliminar un
 * gasto" en el README del backend), esta pantalla no necesita saberlo.
 */
export function Historial() {
  const { periodoId: periodoIdDeUrl } = useParams<{ periodoId?: string }>();
  const { data: periodoActivo, error: errorPeriodoActivo } = usePeriodoActivo();
  const { data: periodos } = usePeriodos();

  const sinPeriodoActivo =
    !periodoIdDeUrl && errorPeriodoActivo instanceof ApiError && errorPeriodoActivo.codigo === 'PERIODO_NO_ENCONTRADO';
  const periodoId = periodoIdDeUrl ?? (!errorPeriodoActivo ? periodoActivo?.id : undefined);
  const periodoViendose = periodoIdDeUrl ? periodos?.find((p) => p.id === periodoIdDeUrl) : periodoActivo;

  const { data: ingresos, isLoading: cargandoIngresos } = useIngresos(periodoId);
  const {
    data: gastos,
    isLoading: cargandoGastos,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useGastos(periodoId);

  const periodosAnteriores = (periodos ?? []).filter(
    (p) => (p.estado === 'cerrado' || p.estado === 'archivado') && p.id !== periodoId
  );

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">← Volver</Link>
        </Button>
        <h1 className="text-xl font-semibold">Historial</h1>
      </div>

      {periodoViendose && (
        <p className="text-sm text-muted-foreground">
          Quincena del {formatearRangoFechas(periodoViendose.fechaInicio, periodoViendose.fechaFin)}
          {periodoViendose.estado !== 'activo' && ` · ${periodoViendose.estado}`}
          {periodoIdDeUrl && periodoActivo && periodoActivo.id !== periodoIdDeUrl && (
            <>
              {' · '}
              <Link to="/historial" className="underline-offset-4 hover:underline">
                ver periodo activo
              </Link>
            </>
          )}
        </p>
      )}

      {sinPeriodoActivo && <p className="text-muted-foreground">No hay periodo activo todavía.</p>}

      {periodoId && (
        <>
          <section>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Ingresos</h2>
            {cargandoIngresos && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {ingresos?.length === 0 && <p className="text-sm text-muted-foreground">Sin ingresos todavía.</p>}
            <ul>{ingresos?.map((ingreso) => <FilaIngreso key={ingreso.id} ingreso={ingreso} />)}</ul>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Gastos</h2>
            {cargandoGastos && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {gastos?.pages[0]?.datos.length === 0 && <p className="text-sm text-muted-foreground">Sin gastos todavía.</p>}
            <ul>
              {gastos?.pages.flatMap((pagina) => pagina.datos).map((gasto) => <FilaGasto key={gasto.id} gasto={gasto} />)}
            </ul>
            {hasNextPage && (
              <Button variant="outline" className="mt-3 w-full" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
              </Button>
            )}
          </section>
        </>
      )}

      {periodosAnteriores.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Periodos anteriores</h2>
          <ul>
            {periodosAnteriores.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 border-b py-3">
                <Link to={`/historial/${p.id}`} className="underline-offset-4 hover:underline">
                  {formatearRangoFechas(p.fechaInicio, p.fechaFin)}
                </Link>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/resumen/${p.id}`}>Ver resumen</Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
