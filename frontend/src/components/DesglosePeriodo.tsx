import { useDesglose, type RecurrenteDesglose, type RubroDesglose } from '@/hooks/use-desglose';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { formatearRangoFechas } from '@/lib/fechas';
import { cn } from '@/lib/utils';

interface DesglosePeriodoProps {
  periodoId: string;
}

function colorDeBarra(tipo: RubroDesglose['tipo']) {
  return tipo === 'aportes_meta' || tipo === 'pagos_tarjeta' ? 'bg-brand-gold' : 'bg-primary';
}

function cuandoSeCobra(recurrente: RecurrenteDesglose) {
  return recurrente.frecuencia === 'mensual' && recurrente.diaMes !== null ? `cada mes, día ${recurrente.diaMes}` : 'cada quincena';
}

/**
 * En qué se fue el dinero de un periodo (backend/README.md, "Desglose del
 * periodo"). Tres partes que suman el "Gastado" del resumen:
 *
 * - **Gastos recurrentes**, aparte: son compromisos fijos, no algo que se
 *   decidió gastar esa semana — metidos en las semanas inflaban siempre
 *   la primera.
 * - **Por categoría** y **por semana**, solo sobre el gasto variable
 *   (incluye "Aportes a metas" y "Pagos de tarjeta" como líneas propias,
 *   que no tienen categoría).
 *
 * "Semana más cara" compara el promedio por día, no el total: una
 * quincena son dos semanas y la segunda absorbe los 1-2 días sueltos del
 * final (8 o 9 días contra 7), así que el total la favorecería siempre.
 */
export function DesglosePeriodo({ periodoId }: DesglosePeriodoProps) {
  const formatearMonto = useFormatearMonto();
  const { data: desglose, isLoading, error } = useDesglose(periodoId);

  if (isLoading) return <p className="text-muted-foreground text-sm">Cargando desglose…</p>;
  if (error) return <p className="text-destructive text-sm">{error.message}</p>;
  if (!desglose) return null;

  const totalGastado = desglose.totalGastado.valorMinimo;
  if (totalGastado <= 0) {
    return <p className="text-muted-foreground text-sm">Todavía no hay gastos en este periodo para desglosar.</p>;
  }

  const moneda = desglose.totalGastado.moneda;
  const totalVariable = desglose.totalVariable.valorMinimo;
  const hayRecurrentes = desglose.recurrentes.items.length > 0;

  const etiquetaDe = new Map(desglose.rubros.map((r) => [r.clave, r.etiqueta]));
  const mayorPromedio = Math.max(...desglose.semanas.map((s) => s.promedioDiario.valorMinimo), 1);
  const totalDias = desglose.semanas.reduce((suma, s) => suma + s.dias, 0);
  const promedioDelPeriodo = Math.floor(totalVariable / totalDias);
  const semanaMasCara = desglose.semanas.find((s) => s.numero === desglose.semanaMasCara);

  return (
    <div className="flex flex-col gap-4">
      {hayRecurrentes && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">GASTOS RECURRENTES</h2>
          <div className="border-border bg-card flex flex-col divide-y rounded-2xl border">
            {desglose.recurrentes.items.map((recurrente) => (
              <div key={recurrente.id} className="flex items-baseline justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{recurrente.descripcion}</p>
                  <p className="text-muted-foreground text-xs">{cuandoSeCobra(recurrente)}</p>
                </div>
                <span className="font-display shrink-0 text-[14px] font-semibold tabular-nums">{formatearMonto(recurrente.monto)}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-2 px-4 py-3 text-[13px]">
              <span className="text-muted-foreground">Total recurrentes</span>
              <span className="font-display font-bold tabular-nums">{formatearMonto(desglose.recurrentes.total)}</span>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            Gastado {formatearMonto(desglose.totalGastado)} = {formatearMonto(desglose.recurrentes.total)} recurrentes + {formatearMonto({ valorMinimo: totalVariable, moneda })} variable.
            Abajo solo se analiza el gasto variable.
          </p>
        </section>
      )}

      {totalVariable <= 0 ? (
        <p className="text-muted-foreground text-sm">No hay gasto variable en este periodo — todo lo gastado fue recurrente.</p>
      ) : (
        <>
          <section className="flex flex-col gap-2.5">
            <h2 className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">GASTO VARIABLE POR CATEGORÍA</h2>
            <div className="border-border bg-card flex flex-col gap-3.5 rounded-2xl border p-4">
              {desglose.rubros.map((rubro) => {
                const porcentaje = Math.max(0, Math.min(100, (rubro.monto.valorMinimo / totalVariable) * 100));
                return (
                  <div key={rubro.clave} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
                      <span className="min-w-0 flex-1 truncate font-medium">{rubro.etiqueta}</span>
                      <span className="font-display font-semibold tabular-nums">{formatearMonto(rubro.monto)}</span>
                      <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">{Math.round(porcentaje)}%</span>
                    </div>
                    <div className="bg-secondary h-2 overflow-hidden rounded-full">
                      <div className={cn('h-full rounded-full', colorDeBarra(rubro.tipo))} style={{ width: `${porcentaje}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">GASTO VARIABLE POR SEMANA</h2>
            {semanaMasCara && (
              <p className="text-[13px]">
                La <strong>semana {semanaMasCara.numero}</strong> fue la más cara por día: {formatearMonto(semanaMasCara.promedioDiario)} al día, contra{' '}
                {formatearMonto({ valorMinimo: promedioDelPeriodo, moneda })} de promedio en todo el periodo.
              </p>
            )}
            <div className="border-border bg-card flex flex-col divide-y rounded-2xl border">
              {desglose.semanas.map((semana) => {
                const esLaMasCara = semana.numero === desglose.semanaMasCara;
                const porcentaje = Math.max(0, (semana.promedioDiario.valorMinimo / mayorPromedio) * 100);
                const principales = [...semana.rubros]
                  .filter((r) => r.monto.valorMinimo > 0)
                  .sort((a, b) => b.monto.valorMinimo - a.monto.valorMinimo)
                  .slice(0, 3);
                return (
                  <div key={semana.numero} className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[14px] font-semibold">
                          Semana {semana.numero}
                          {esLaMasCara && (
                            <span className="bg-brand-gold/20 text-brand-gold-foreground ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold">Más cara</span>
                          )}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {formatearRangoFechas(semana.fechaInicio, semana.fechaFin)} ·{' '}
                          {semana.diasTranscurridos === 0
                            ? `todavía no empieza · ${semana.dias} días`
                            : semana.diasTranscurridos < semana.dias
                              ? `en curso, ${semana.diasTranscurridos} de ${semana.dias} días`
                              : `${semana.dias} días`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-[15px] font-bold tabular-nums">{formatearMonto(semana.total)}</p>
                        <p className="text-muted-foreground text-xs tabular-nums">{formatearMonto(semana.promedioDiario)} al día</p>
                      </div>
                    </div>
                    <div className="bg-secondary h-2 overflow-hidden rounded-full">
                      <div className={cn('h-full rounded-full', esLaMasCara ? 'bg-brand-gold' : 'bg-primary')} style={{ width: `${porcentaje}%` }} />
                    </div>
                    {principales.length > 0 && (
                      <p className="text-muted-foreground text-xs">
                        {principales.map((r) => `${etiquetaDe.get(r.clave) ?? r.clave} ${formatearMonto(r.monto)}`).join(' · ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
