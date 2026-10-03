import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEliminarCuenta } from '@/hooks/use-eliminar-cuenta';

const PALABRA_DE_CONFIRMACION = 'ELIMINAR';

/**
 * Irreversible, así que no basta un "¿seguro?": hay que escribir la
 * palabra. El backend la vuelve a exigir (eliminarCuenta) — esta pantalla
 * solo evita que se llegue a mandar por accidente. Al terminar, el cierre
 * de sesión local hace que `ProtectedRoute` lleve a /login solo.
 */
export function EliminarCuenta() {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const eliminarCuenta = useEliminarCuenta();

  if (!abierto) {
    return (
      <Button variant="outline" className="border-destructive/25 text-destructive hover:bg-destructive/5 h-10 w-full rounded-xl" onClick={() => setAbierto(true)}>
        Eliminar mi cuenta
      </Button>
    );
  }

  return (
    <div className="border-destructive/30 flex flex-col gap-3 rounded-xl border p-3.5">
      <p className="text-[13px]">
        Se borrarán <strong>todos tus datos</strong> —ingresos, gastos, metas, tarjetas, historial— y se cancelará tu suscripción si tienes una. Esto{' '}
        <strong>no se puede deshacer</strong>. Si quieres conservar algo, descarga tus datos antes.
      </p>
      <label className="flex flex-col gap-1.5 text-[12.5px]">
        Para confirmar, escribe {PALABRA_DE_CONFIRMACION}
        <Input value={texto} onChange={(evento) => setTexto(evento.target.value)} autoComplete="off" className="h-10 rounded-xl" />
      </label>
      {eliminarCuenta.isError && <p className="text-destructive text-sm">{eliminarCuenta.error.message}</p>}
      <div className="flex gap-2">
        <Button
          variant="destructive"
          className="h-10 flex-1 rounded-xl"
          disabled={texto !== PALABRA_DE_CONFIRMACION || eliminarCuenta.isPending}
          onClick={() => eliminarCuenta.mutate(texto)}
        >
          {eliminarCuenta.isPending ? 'Eliminando…' : 'Eliminar para siempre'}
        </Button>
        <Button
          variant="ghost"
          className="h-10 rounded-xl"
          disabled={eliminarCuenta.isPending}
          onClick={() => {
            setAbierto(false);
            setTexto('');
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
