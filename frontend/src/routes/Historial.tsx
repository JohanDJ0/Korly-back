import { Download } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import { FilaGasto } from '@/components/FilaGasto';
import { FilaIngreso } from '@/components/FilaIngreso';
import { FormularioImportar } from '@/components/FormularioImportar';
import { PageHeader } from '@/components/PageHeader';
import { useExportar } from '@/hooks/use-exportar';
import { useGastos } from '@/hooks/use-gastos';
import { useIngresos } from '@/hooks/use-ingresos';
import { usePagosTarjetaPeriodo } from '@/hooks/use-pagos-tarjeta-periodo';
import { usePeriodoActivo } from '@/hooks/use-periodo-activo';
import { usePeriodos } from '@/hooks/use-periodos';
import { ApiError } from '@/lib/api';
import { formatearMonto } from '@/lib/dinero';
import { formatearFechaHora, formatearRangoFechas } from '@/lib/fechas';
import { cn } from '@/lib/utils';

type Filtro = 'todo' | 'ingresos' | 'gastos';

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
  const [filtro, setFiltro] = useState<Filtro>('todo');

  const sinPeriodoActivo =
    !periodoIdDeUrl && errorPeriodoActivo instanceof ApiError && errorPeriodoActivo.codigo === 'PERIODO_NO_ENCONTRADO';
  const periodoId = periodoIdDeUrl ?? (!errorPeriodoActivo ? periodoActivo?.id : undefined);
  const periodoViendose = periodoIdDeUrl ? periodos?.find((p) => p.id === periodoIdDeUrl) : periodoActivo;

  const { data: ingresos, isLoading: cargandoIngresos, error: errorIngresos } = useIngresos(periodoId);
  const {
    data: gastos,
    isLoading: cargandoGastos,
    error: errorGastos,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useGastos(periodoId);
  const { data: pagosTarjeta } = usePagosTarjetaPeriodo(periodoId);

  // Hallazgo del pase de QA/UX: un gasto/ingreso editado o eliminado
  // (revertido: true, backend/README.md "nunca hard delete") se
  // quedaba visible para siempre, atenuado y marcado "Corregido" — para
  // el usuario, eso se veía como "lo eliminé y sigue apareciendo". El
  // backend SÍ guarda la fila para siempre (ADR-001, integridad del
  // ledger) — eso no cambia y no puede cambiar; lo que se ajusta aquí
  // es solo que Historial ya no la MUESTRE por defecto una vez corregida.
  const ingresosVigentes = (ingresos ?? []).filter((i) => !i.revertido);
  const gastosVigentes = (gastos?.pages.flatMap((pagina) => pagina.datos) ?? []).filter((g) => !g.revertido);

  const periodosAnteriores = (periodos ?? []).filter(
    (p) => (p.estado === 'cerrado' || p.estado === 'archivado') && p.id !== periodoId
  );
  // Hallazgo del pase de QA/UX: cerrar un periodo manualmente antes de
  // tiempo y crear otro puede dejar dos periodos 'cerrado' con el mismo
  // fechaInicio/fechaFin (la quincena calendario no cambió) — sin nada
  // que los distinga, el usuario no puede saber cuál es cuál. Solo se
  // muestra `creadoEn` cuando de verdad hace falta, no para el caso
  // normal (un único periodo por rango).
  const rangosRepetidos = new Set(
    Object.entries(
      periodosAnteriores.reduce<Record<string, number>>((conteo, p) => {
        const clave = `${p.fechaInicio}|${p.fechaFin}`;
        conteo[clave] = (conteo[clave] ?? 0) + 1;
        return conteo;
      }, {})
    )
      .filter(([, total]) => total > 1)
      .map(([clave]) => clave)
  );

  const exportar = useExportar();
  // Importar solo tiene sentido contra el periodo activo (backend/README.md,
  // "Importación") — al ver un periodo ya cerrado en /historial/:periodoId,
  // no se ofrece, en vez de dejar que el usuario lo intente y falle con
  // PERIODO_NO_ACTIVO.
  const viendoElPeriodoActivo = periodoViendose?.estado === 'activo';

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col md:max-w-3xl md:px-8 md:pt-8">
      <PageHeader titulo="Historial" />

      <div className="flex flex-col gap-4 px-5 md:px-0">
        {
          // Exporta TODO el historial del tenant (no solo el periodo que
          // se está viendo aquí) — documento-maestro-v2.md §12,
          // "importación/exportación" (ver backend/README.md, "Exportación").
        }
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-xl" disabled={exportar.isPending} onClick={() => exportar.mutate('gastos')}>
            <Download size={13} /> Gastos (CSV)
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" disabled={exportar.isPending} onClick={() => exportar.mutate('ingresos')}>
            <Download size={13} /> Ingresos (CSV)
          </Button>
        </div>
        {exportar.isError && <p className="text-destructive text-sm">{exportar.error.message}</p>}

        {periodoViendose && (
          <p className="text-muted-foreground text-[13px]">
            Quincena · {formatearRangoFechas(periodoViendose.fechaInicio, periodoViendose.fechaFin)}
            {periodoViendose.estado !== 'activo' && ` · ${periodoViendose.estado}`}
            {periodoIdDeUrl && periodoActivo && periodoActivo.id !== periodoIdDeUrl && (
              <>
                {' · '}
                <Link to="/historial" className="text-primary font-semibold">
                  ver periodo activo
                </Link>
              </>
            )}
          </p>
        )}

        {sinPeriodoActivo && <p className="text-muted-foreground">No hay periodo activo todavía.</p>}

        {periodoId && (
          <div className="flex gap-2">
            {(['todo', 'ingresos', 'gastos'] as const).map((opcion) => (
              <button
                key={opcion}
                onClick={() => setFiltro(opcion)}
                className={cn(
                  'rounded-full px-4 py-2 text-[13px] font-medium capitalize',
                  filtro === opcion ? 'bg-foreground text-background' : 'border-input bg-card border'
                )}
              >
                {opcion}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6 px-5 pt-4 md:px-0">
        {periodoId && (filtro === 'todo' || filtro === 'ingresos') && (
          <section>
            <div className="mb-1 flex items-start justify-between gap-2">
              <h2 className="text-muted-foreground pt-1 text-[12.5px] font-semibold tracking-wide">INGRESOS</h2>
              {viendoElPeriodoActivo && periodoId && <FormularioImportar tipo="ingresos" periodoId={periodoId} />}
            </div>
            {cargandoIngresos && <p className="text-muted-foreground text-sm">Cargando…</p>}
            {errorIngresos && <p className="text-destructive text-sm">{errorIngresos.message}</p>}
            {ingresosVigentes.length === 0 && <p className="text-muted-foreground text-sm">Sin ingresos todavía.</p>}
            <ul>{ingresosVigentes.map((ingreso) => <FilaIngreso key={ingreso.id} ingreso={ingreso} />)}</ul>
          </section>
        )}

        {periodoId && (filtro === 'todo' || filtro === 'gastos') && (
          <section>
            <div className="mb-1 flex items-start justify-between gap-2">
              <h2 className="text-muted-foreground pt-1 text-[12.5px] font-semibold tracking-wide">GASTOS</h2>
              {viendoElPeriodoActivo && periodoId && <FormularioImportar tipo="gastos" periodoId={periodoId} />}
            </div>
            {cargandoGastos && <p className="text-muted-foreground text-sm">Cargando…</p>}
            {errorGastos && <p className="text-destructive text-sm">{errorGastos.message}</p>}
            {gastosVigentes.length === 0 && <p className="text-muted-foreground text-sm">Sin gastos todavía.</p>}
            <ul>
              {gastosVigentes.map((gasto) => <FilaGasto key={gasto.id} gasto={gasto} />)}
            </ul>
            {hasNextPage && (
              <Button variant="outline" className="mt-3 w-full rounded-xl" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
              </Button>
            )}
          </section>
        )}

        {
          // Hallazgo real: un pago de tarjeta nunca aparece arriba, en
          // "Gastos" — es un tipo de movimiento distinto (ver
          // backend/README.md, "Tarjetas de crédito y MSI"). Sin esta
          // sección, no había ninguna forma de ver, desde el
          // historial, qué mensualidades ya se aplicaron a este
          // periodo. Solo se muestra si hay algo que mostrar.
        }
        {pagosTarjeta && pagosTarjeta.length > 0 && (
          <section>
            <h2 className="text-muted-foreground mb-1 text-[12.5px] font-semibold tracking-wide">PAGOS DE TARJETA</h2>
            <ul>
              {pagosTarjeta.map((pago, indice) => (
                <li key={indice} className="flex items-center justify-between gap-2 border-b py-3 last:border-b-0">
                  <div>
                    <p className="font-medium">{formatearMonto(pago.monto)}</p>
                    <p className="text-muted-foreground text-sm">
                      {pago.tarjetaNombre} — {pago.cargoDescripcion} ({pago.numeroPago}/{pago.numeroPlazos})
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {periodosAnteriores.length > 0 && (
          <section>
            <h2 className="text-muted-foreground mb-1 text-[12.5px] font-semibold tracking-wide">PERIODOS ANTERIORES</h2>
            <ul>
              {periodosAnteriores.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 border-b py-3 last:border-b-0">
                  <Link to={`/historial/${p.id}`} className="text-[14px] underline-offset-4 hover:underline">
                    {formatearRangoFechas(p.fechaInicio, p.fechaFin)}
                    {rangosRepetidos.has(`${p.fechaInicio}|${p.fechaFin}`) && (
                      <span className="text-muted-foreground"> — creado {formatearFechaHora(p.creadoEn)}</span>
                    )}
                  </Link>
                  <Button asChild variant="outline" size="sm" className="rounded-xl">
                    <Link to={`/resumen/${p.id}`}>Ver resumen</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="pb-6" />
      <BottomNav />
    </div>
  );
}
