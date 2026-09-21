import { Link } from 'react-router-dom';

import { useCategorias } from '@/hooks/use-categorias';
import { useGastos } from '@/hooks/use-gastos';
import { formatearMonto } from '@/lib/dinero';
import { formatearFechaActividad } from '@/lib/fechas';
import { iconoCategoria } from '@/lib/icono-categoria';

const LIMITE_VISIBLE = 3;

interface ActividadRecienteProps {
  periodoId: string;
}

/**
 * Adelanto de los últimos gastos directamente en Home — antes había que
 * entrar a Historial para ver cualquier actividad. Solo gastos (no
 * ingresos, que son mucho menos frecuentes) y solo los activos: uno
 * revertido no es "lo último que pasó", es una corrección ya resuelta
 * (ver FilaGasto.tsx, "Corregido").
 */
export function ActividadReciente({ periodoId }: ActividadRecienteProps) {
  const { data } = useGastos(periodoId);
  const { data: categorias } = useCategorias();

  const gastos = data?.pages[0]?.datos.filter((g) => !g.revertido).slice(0, LIMITE_VISIBLE) ?? [];

  if (gastos.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="mt-0.5 flex items-center justify-between">
        <h3 className="text-[14.5px]">Actividad reciente</h3>
        <Link to="/historial" className="text-primary text-[12.5px] font-semibold">
          Ver todo
        </Link>
      </div>

      <ul className="flex flex-col">
        {gastos.map((gasto, indice) => {
          const categoriaDelGasto = categorias?.find((c) => c.id === gasto.categoriaId);
          const nombreCategoria = categoriaDelGasto?.nombre;
          const Icono = iconoCategoria(nombreCategoria, categoriaDelGasto?.icono);
          return (
            <li key={gasto.id}>
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
