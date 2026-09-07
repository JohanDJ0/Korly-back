import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEditarIngreso } from '@/hooks/use-editar-ingreso';
import { useEliminarIngreso } from '@/hooks/use-eliminar-ingreso';
import type { Ingreso } from '@/hooks/use-ingresos';
import { formatearMonto } from '@/lib/dinero';

interface FilaIngresoProps {
  ingreso: Ingreso;
}

/** Espejo exacto de FilaGasto.tsx — mismo mecanismo de corrección, ver backend/README.md "Editar y eliminar un ingreso". */
export function FilaIngreso({ ingreso }: FilaIngresoProps) {
  const [editando, setEditando] = useState(false);
  const [monto, setMonto] = useState(() => (ingreso.monto.valorMinimo / 100).toString());
  const editarIngreso = useEditarIngreso();
  const eliminarIngreso = useEliminarIngreso();

  function guardar() {
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) return;
    editarIngreso.mutate(
      { ingresoId: ingreso.id, monto: { valorMinimo: Math.round(valor * 100), moneda: ingreso.monto.moneda } },
      { onSuccess: () => setEditando(false) }
    );
  }

  function eliminar() {
    if (!window.confirm('¿Eliminar este ingreso?')) return;
    editarIngreso.reset();
    eliminarIngreso.mutate(ingreso.id);
  }

  if (ingreso.revertido) {
    return (
      <li className="flex items-center justify-between gap-2 border-b py-3 opacity-50">
        <div>
          <p className="font-medium line-through">{formatearMonto(ingreso.monto)}</p>
          <p className="text-sm text-muted-foreground">
            {ingreso.fechaEfectiva}
            {ingreso.nota ? ` — ${ingreso.nota}` : ''}
          </p>
        </div>
        <span className="shrink-0 text-sm text-muted-foreground">Corregido</span>
      </li>
    );
  }

  if (editando) {
    return (
      <li className="flex flex-wrap items-center gap-2 border-b py-3">
        <Input
          value={monto}
          onChange={(evento) => setMonto(evento.target.value)}
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
            setEditando(false);
          }}
        >
          Cancelar
        </Button>
        {editarIngreso.isError && <p className="w-full text-sm text-destructive">{editarIngreso.error.message}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 border-b py-3">
      <div>
        <p className="font-medium">{formatearMonto(ingreso.monto)}</p>
        <p className="text-sm text-muted-foreground">
          {ingreso.fechaEfectiva}
          {ingreso.nota ? ` — ${ingreso.nota}` : ''}
        </p>
        {eliminarIngreso.isError && <p className="text-sm text-destructive">{eliminarIngreso.error.message}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
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
        <Button size="sm" variant="outline" onClick={eliminar} disabled={eliminarIngreso.isPending}>
          Eliminar
        </Button>
      </div>
    </li>
  );
}
