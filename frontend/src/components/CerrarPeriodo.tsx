import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HojaInferior } from '@/components/HojaInferior';
import { useCerrarPeriodo } from '@/hooks/use-cerrar-periodo';
import { usePeriodoActivo } from '@/hooks/use-periodo-activo';
import { formatearRangoFechas } from '@/lib/fechas';

const PALABRA_DE_CONFIRMACION = 'CERRAR';

/**
 * Cierre manual del periodo, con la fricción que merece. Vivía como un
 * botón tenue al fondo de Home — justo donde antes estaba "Cerrar sesión",
 * y un usuario real lo pulsó creyendo que salía de su cuenta. Ahora está
 * en Ajustes, lejos de las pantallas de uso diario, y pide escribir la
 * palabra (mismo patrón que EliminarCuenta). Aun así es reversible: el
 * resumen ofrece "Reabrir periodo" (backend ADR-009).
 *
 * `¿Querías cerrar sesión?` en la hoja es a propósito: es el error exacto
 * que se quiere atajar, y la salida correcta está en esta misma pantalla.
 */
export function CerrarPeriodo() {
  const { data: periodo } = usePeriodoActivo();
  const cerrarPeriodo = useCerrarPeriodo();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');

  function cerrarHoja() {
    setAbierto(false);
    setTexto('');
    cerrarPeriodo.reset();
  }

  if (!periodo) {
    return <p className="text-muted-foreground text-[13px]">No tienes un periodo abierto en este momento.</p>;
  }

  const confirmado = texto.trim().toUpperCase() === PALABRA_DE_CONFIRMACION;

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <p className="text-muted-foreground text-[13px]">
          Tu periodo actual es del <strong className="text-foreground">{formatearRangoFechas(periodo.fechaInicio, periodo.fechaFin)}</strong>. Se cierra solo al terminar la quincena; ciérralo antes solo si de verdad
          quieres cortarlo aquí.
        </p>
        <Button variant="outline" className="h-10 w-full rounded-xl" onClick={() => setAbierto(true)}>
          Cerrar este periodo…
        </Button>
      </div>

      {abierto && (
        <HojaInferior titulo="Cerrar periodo" onCerrar={cerrarHoja}>
          <div className="flex flex-col gap-3.5">
            <div className="bg-secondary text-secondary-foreground rounded-xl p-3 text-[13px]">
              ¿Querías salir de tu cuenta? Eso es <strong>Cerrar sesión</strong>, arriba en esta misma pantalla, en Cuenta.
            </div>

            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px]">
              <li>Se genera el resumen del periodo y ya no podrás registrar gastos ni ingresos en él.</li>
              <li>El sobrante queda por decidir: guardarlo en una meta o pasarlo al periodo siguiente.</li>
              <li>Si fue un error, podrás reabrirlo desde su resumen mientras no hayas decidido el sobrante.</li>
            </ul>

            <label className="flex flex-col gap-1.5 text-[12.5px]">
              Para confirmar, escribe {PALABRA_DE_CONFIRMACION}
              <Input value={texto} onChange={(evento) => setTexto(evento.target.value)} autoComplete="off" className="h-10 rounded-xl" />
            </label>

            {cerrarPeriodo.isError && <p className="text-destructive text-sm">{cerrarPeriodo.error.message}</p>}

            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="h-10 flex-1 rounded-xl"
                disabled={!confirmado || cerrarPeriodo.isPending}
                onClick={() =>
                  cerrarPeriodo.mutate(periodo.id, {
                    onSuccess: (resumen) => navigate(`/resumen/${resumen.periodoId}`),
                  })
                }
              >
                {cerrarPeriodo.isPending ? 'Cerrando…' : 'Cerrar periodo'}
              </Button>
              <Button variant="ghost" className="h-10 rounded-xl" disabled={cerrarPeriodo.isPending} onClick={cerrarHoja}>
                Cancelar
              </Button>
            </div>
          </div>
        </HojaInferior>
      )}
    </>
  );
}
