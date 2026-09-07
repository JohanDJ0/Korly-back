import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { FilaGasto } from '@/components/FilaGasto';
import { useGastos } from '@/hooks/use-gastos';
import { useIngresos } from '@/hooks/use-ingresos';
import { usePeriodoActivo } from '@/hooks/use-periodo-activo';
import { ApiError } from '@/lib/api';
import { formatearMonto } from '@/lib/dinero';

/**
 * Historial del periodo ACTIVO únicamente — no hay todavía forma de ver
 * periodos cerrados desde el frontend (el backend sí los soporta, ver
 * GET /periodos/:periodoId/{ingresos,gastos}, pero no hay una pantalla
 * que liste periodos pasados). Se agrega cuando haga falta.
 */
export function Historial() {
  const { data: periodo, error: errorPeriodo } = usePeriodoActivo();
  const sinPeriodoActivo = errorPeriodo instanceof ApiError && errorPeriodo.codigo === 'PERIODO_NO_ENCONTRADO';

  const { data: ingresos, isLoading: cargandoIngresos } = useIngresos(periodo?.id);
  const {
    data: gastos,
    isLoading: cargandoGastos,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useGastos(periodo?.id);

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">← Volver</Link>
        </Button>
        <h1 className="text-xl font-semibold">Historial</h1>
      </div>

      {sinPeriodoActivo && <p className="text-muted-foreground">No hay periodo activo todavía.</p>}

      {periodo && (
        <>
          <section>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Ingresos</h2>
            {cargandoIngresos && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {ingresos?.length === 0 && <p className="text-sm text-muted-foreground">Sin ingresos todavía.</p>}
            <ul>
              {ingresos?.map((ingreso) => (
                <li key={ingreso.id} className="flex items-center justify-between border-b py-3">
                  <div>
                    <p className="font-medium">{formatearMonto(ingreso.monto)}</p>
                    <p className="text-sm text-muted-foreground">
                      {ingreso.fechaEfectiva}
                      {ingreso.nota ? ` — ${ingreso.nota}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
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
    </div>
  );
}
