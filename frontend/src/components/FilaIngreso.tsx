import { TrendingUp } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BotonConfirmar } from '@/components/BotonConfirmar';
import { useEditarIngreso } from '@/hooks/use-editar-ingreso';
import { useEliminarIngreso } from '@/hooks/use-eliminar-ingreso';
import type { Ingreso } from '@/hooks/use-ingresos';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';

interface FilaIngresoProps {
  ingreso: Ingreso;
  /** Es el único ingreso vigente del periodo: borrarlo deja la quincena sin cifra, y la confirmación lo dice. */
  esElUnico?: boolean;
}

/** Espejo exacto de FilaGasto.tsx — mismo mecanismo de corrección, ver backend/README.md "Editar y eliminar un ingreso". */
export function FilaIngreso({ ingreso, esElUnico = false }: FilaIngresoProps) {
  const formatearMonto = useFormatearMonto();
  const [editando, setEditando] = useState(false);
  const [monto, setMonto] = useState(() => (ingreso.monto.valorMinimo / 100).toString());
  // Hallazgo del pase de QA/UX: un monto inválido no debe fallar en
  // silencio — mismo criterio que FilaGasto.tsx.
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const editarIngreso = useEditarIngreso();
  const eliminarIngreso = useEliminarIngreso();

  function guardar() {
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) {
      setErrorValidacion('El monto debe ser mayor a cero');
      return;
    }
    setErrorValidacion(null);
    editarIngreso.mutate(
      { ingresoId: ingreso.id, monto: { valorMinimo: Math.round(valor * 100), moneda: ingreso.monto.moneda } },
      { onSuccess: () => setEditando(false) }
    );
  }

  if (editando) {
    return (
      <li className="flex flex-wrap items-center gap-2 border-b py-3 last:border-b-0">
        <Input
          value={monto}
          onChange={(evento) => {
            setMonto(evento.target.value);
            setErrorValidacion(null);
          }}
          type="number"
          step="0.01"
          min="0"
          autoFocus
          className="w-28"
        />
        <Button size="sm" onClick={guardar} disabled={editarIngreso.isPending}>
          {editarIngreso.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            editarIngreso.reset();
            setErrorValidacion(null);
            setEditando(false);
          }}
        >
          Cancelar
        </Button>
        {(errorValidacion ?? editarIngreso.error?.message) && (
          <p className="text-destructive w-full text-sm">{errorValidacion ?? editarIngreso.error?.message}</p>
        )}
      </li>
    );
  }

  return (
    // flex-wrap: al pedir confirmación, los botones pasan a su propio renglón en vez de salirse de la pantalla en el celular.
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b py-3 last:border-b-0">
      <div className="bg-secondary flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl">
        <TrendingUp size={16} className="text-secondary-foreground" />
      </div>
      <div className="min-w-0 flex-1 basis-36">
        <p className="text-primary font-medium">+{formatearMonto(ingreso.monto)}</p>
        <p className="text-muted-foreground text-sm">
          {ingreso.fechaEfectiva}
          {ingreso.nota ? ` — ${ingreso.nota}` : ''}
        </p>
        {eliminarIngreso.isError && <p className="text-destructive text-sm">{eliminarIngreso.error.message}</p>}
      </div>
      <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            eliminarIngreso.reset();
            setEditando(true);
          }}
        >
          Editar
        </Button>
        <BotonConfirmar
          variant="outline"
          size="sm"
          pregunta={`¿Eliminar este ingreso de ${formatearMonto(ingreso.monto)}?${esElUnico ? " Es el único de la quincena: sin él no se puede calcular cuánto puedes gastar." : ""}`}
          onConfirmar={() => {
            editarIngreso.reset();
            eliminarIngreso.mutate(ingreso.id);
          }}
          disabled={eliminarIngreso.isPending}
        >
          Eliminar
        </BotonConfirmar>
      </div>
    </li>
  );
}
