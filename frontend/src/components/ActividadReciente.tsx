import { PiggyBank } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAportesMeta, type AporteDelPeriodo } from '@/hooks/use-aportes-meta';
import { useCategorias } from '@/hooks/use-categorias';
import { useGastos, type Gasto } from '@/hooks/use-gastos';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { formatearFechaActividad } from '@/lib/fechas';
import { iconoCategoria } from '@/lib/icono-categoria';

const LIMITE_VISIBLE = 3;

interface ActividadRecienteProps {
  periodoId: string;
}

/**
 * Adelanto de lo último que pasó, directamente en Home — antes había que
 * entrar a Historial para ver cualquier actividad. Gastos y lo aportado a
 * metas (no ingresos, que son mucho menos frecuentes), mezclados por
 * fecha de registro: un aporte no es un gasto —no cuenta en la cifra de
 * hoy ni en las semanas— pero sí es dinero que salió de la quincena, y
 * verlo aquí dice a dónde se fue ("Ahorro a Vacaciones"). Solo los gastos
 * activos: uno revertido no es "lo último que pasó", es una corrección ya
 * resuelta (ver FilaGasto.tsx, "Corregido").
 */
export function ActividadReciente({ periodoId }: ActividadRecienteProps) {
  const formatearMonto = useFormatearMonto();
  const { data } = useGastos(periodoId);
  const { data: categorias } = useCategorias();

  const { data: aportes } = useAportesMeta(periodoId);

  type Entrada =
    | { tipo: 'gasto'; id: string; registro: string; gasto: Gasto }
    | { tipo: 'ahorro'; id: string; registro: string; aporte: AporteDelPeriodo };
  const entradas: Entrada[] = [
    ...(data?.pages[0]?.datos.filter((g) => !g.revertido).map((gasto): Entrada => ({ tipo: 'gasto', id: gasto.id, registro: gasto.fechaRegistro, gasto })) ?? []),
    ...(aportes?.map((aporte): Entrada => ({ tipo: 'ahorro', id: `ahorro-${aporte.id}`, registro: aporte.fechaRegistro, aporte })) ?? []),
  ]
    .sort((a, b) => (a.registro < b.registro ? 1 : a.registro > b.registro ? -1 : 0))
    .slice(0, LIMITE_VISIBLE);

  if (entradas.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="mt-0.5 flex items-center justify-between">
        <h3 className="text-[14.5px]">Actividad reciente</h3>
        <Link to="/historial" className="text-primary text-[12.5px] font-semibold">
          Ver todo
        </Link>
      </div>

      <ul className="flex flex-col">
        {entradas.map((entrada, indice) => {
          if (entrada.tipo === 'ahorro') {
            const { aporte } = entrada;
            return (
              <li key={entrada.id}>
                {indice > 0 && <div className="bg-border h-px" />}
                <div className="flex items-center gap-3 py-2.5">
                  <div className="bg-brand-gold/20 flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl">
                    <PiggyBank size={17} className="text-brand-gold-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">Ahorro a {aporte.metaNombre}</div>
                    <div className="text-muted-foreground text-xs">{formatearFechaActividad(aporte.fechaEfectiva)} · a tu meta</div>
                  </div>
                  <div className="text-[14.5px] font-semibold">-{formatearMonto(aporte.monto)}</div>
                </div>
              </li>
            );
          }
          const { gasto } = entrada;
          const categoriaDelGasto = categorias?.find((c) => c.id === gasto.categoriaId);
          const nombreCategoria = categoriaDelGasto?.nombre;
          const Icono = iconoCategoria(nombreCategoria, categoriaDelGasto?.icono);
          return (
            <li key={entrada.id}>
              {indice > 0 && <div className="bg-border h-px" />}
              <div className="flex items-center gap-3 py-2.5">
                <div className="bg-secondary flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl">
                  <Icono size={17} className="text-secondary-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{nombreCategoria ?? 'Sin categoría'}</div>
                  <div className="text-muted-foreground text-xs">
                    {formatearFechaActividad(gasto.fechaEfectiva)}
                    {gasto.esRecurrente ? ' · automático' : ''}
                  </div>
                </div>
                <div className="text-[14.5px] font-semibold">-{formatearMonto(gasto.monto)}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
