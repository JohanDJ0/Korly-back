import { Link } from 'react-router-dom';

import { useDesglose } from '@/hooks/use-desglose';
import { formatearMonto } from '@/lib/dinero';
import { cn } from '@/lib/utils';

interface ResumenCompactoPeriodoProps {
  periodoId: string;
}

const MAX_CATEGORIAS = 3;

/**
 * Versión de bolsillo de `DesglosePeriodo.tsx` para Home — la pantalla de
 * la cifra única no debe volverse un dashboard (documento-maestro-v2.md
 * §15.1: "dashboards densos" es Won't), así que solo muestra las 3
 * categorías principales del gasto variable, los recurrentes en una línea
 * aparte y una barra por semana, con un enlace al desglose completo en
 * Historial. Mismos datos, misma consulta (`useDesglose`): React Query la
 * comparte con el desglose completo, no es una petición extra al abrirlo.
 *
 * La semana en curso va resaltada y se promedia solo con los días que ya
 * pasaron (`diasTranscurridos`), igual que el desglose completo.
 */
export function ResumenCompactoPeriodo({ periodoId }: ResumenCompactoPeriodoProps) {
  const { data: desglose } = useDesglose(periodoId);

  // Sin datos (cargando/error) o sin ningún gasto todavía: nada que mostrar.
  // Es un complemento de Home, no algo que merezca un estado de carga ni un
  // mensaje de error propios.
  if (!desglose || desglose.totalGastado.valorMinimo <= 0) return null;

  const moneda = desglose.totalGastado.moneda;
  const totalVariable = desglose.totalVariable.valorMinimo;
  const hayRecurrentes = desglose.recurrentes.items.length > 0;
  const principales = desglose.rubros.slice(0, MAX_CATEGORIAS);
  const restantes = desglose.rubros.length - principales.length;

  const periodoTerminado = desglose.semanas.every((s) => s.diasTranscurridos >= s.dias);
  const semanasConDias = desglose.semanas.filter((s) => s.diasTranscurridos > 0);
  const semanaEnCurso = periodoTerminado ? undefined : semanasConDias[semanasConDias.length - 1];
  const mayorTotal = Math.max(...desglose.semanas.map((s) => s.total.valorMinimo), 1);

  return (
    <section className="border-border bg-card flex flex-col gap-3.5 rounded-2xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">EN QUÉ LLEVAS GASTADO</h2>
        <Link to="/historial?desglose=1" className="text-primary shrink-0 text-[12.5px] font-semibold">
          Ver desglose →
        </Link>
      </div>

      {totalVariable > 0 && (
        <div className="flex flex-col gap-2.5">
          {principales.map((rubro) => {
            const porcentaje = Math.max(0, Math.min(100, (rubro.monto.valorMinimo / totalVariable) * 100));
            return (
              <div key={rubro.clave} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate font-medium">{rubro.etiqueta}</span>
                  <span className="font-display font-semibold tabular-nums">{formatearMonto(rubro.monto)}</span>
                </div>
                <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
                  <div
                    className={cn('h-full rounded-full', rubro.tipo === 'aportes_meta' || rubro.tipo === 'pagos_tarjeta' ? 'bg-brand-gold' : 'bg-primary')}
                    style={{ width: `${porcentaje}%` }}
                  />
                </div>
              </div>
            );
          })}
          {restantes > 0 && <p className="text-muted-foreground text-xs">y {restantes} más</p>}
        </div>
      )}

      {hayRecurrentes && (
        <div className="border-border flex items-baseline justify-between gap-2 border-t pt-3 text-[13px]">
          <span className="text-muted-foreground">Recurrentes (aparte)</span>
          <span className="font-display font-semibold tabular-nums">{formatearMonto(desglose.recurrentes.total)}</span>
        </div>
      )}

      {totalVariable > 0 && (
        <div className="border-border flex flex-col gap-2 border-t pt-3">
          {desglose.semanas.map((semana) => {
            const enCurso = semana.numero === semanaEnCurso?.numero;
            const todaviaNoEmpieza = semana.diasTranscurridos === 0;
            const porcentaje = Math.max(0, (semana.total.valorMinimo / mayorTotal) * 100);
            return (
              <div key={semana.numero} className={cn('flex items-center gap-2.5 text-[12.5px]', todaviaNoEmpieza && 'opacity-50')}>
                <span className={cn('w-16 shrink-0', enCurso ? 'font-semibold' : 'text-muted-foreground')}>
                  Semana {semana.numero}
                </span>
                <div className="bg-secondary h-1.5 flex-1 overflow-hidden rounded-full">
                  <div className={cn('h-full rounded-full', enCurso ? 'bg-brand-gold' : 'bg-primary')} style={{ width: `${porcentaje}%` }} />
                </div>
                <span className="font-display w-20 shrink-0 text-right font-semibold tabular-nums">
                  {todaviaNoEmpieza ? '—' : formatearMonto(semana.total)}
                </span>
              </div>
            );
          })}
          <p className="text-muted-foreground text-xs">
            {semanaEnCurso
              ? `Semana ${semanaEnCurso.numero} en curso: ${formatearMonto(semanaEnCurso.promedioDiario)} al día, ${semanaEnCurso.diasTranscurridos} de ${semanaEnCurso.dias} días.`
              : `Gasto variable de la quincena, sin recurrentes: ${formatearMonto({ valorMinimo: totalVariable, moneda })}.`}
          </p>
        </div>
      )}
    </section>
  );
}
