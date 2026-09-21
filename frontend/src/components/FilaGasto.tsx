import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BotonConfirmar } from '@/components/BotonConfirmar';
import { SelectorCategoria } from '@/components/SelectorCategoria';
import { useCategorias } from '@/hooks/use-categorias';
import { useEditarGasto } from '@/hooks/use-editar-gasto';
import { useEliminarGasto } from '@/hooks/use-eliminar-gasto';
import type { Gasto } from '@/hooks/use-gastos';
import { formatearMonto } from '@/lib/dinero';
import { iconoCategoria } from '@/lib/icono-categoria';

interface FilaGastoProps {
  gasto: Gasto;
}

/**
 * Editar/eliminar aquí siempre corrige el MISMO periodo que se está
 * viendo (es el periodo activo — ver Historial.tsx) — el backend nunca
 * muta esta fila, genera una reversión y, al editar, una fila nueva
 * (ver backend/README.md, "Editar y eliminar un gasto"). Por eso, tras
 * guardar, esta fila puede seguir mostrando el monto viejo hasta que el
 * refetch trae la fila nueva — es el comportamiento correcto, no un bug.
 */
export function FilaGasto({ gasto }: FilaGastoProps) {
  const [editando, setEditando] = useState(false);
  const [monto, setMonto] = useState(() => (gasto.monto.valorMinimo / 100).toString());
  // Precargada con la categoría actual: a diferencia de dejarla vacía,
  // esto evita que "solo corregir el monto" borre la categoría por
  // accidente con solo abrir y guardar sin tocarla (sigue siendo
  // posible quitarla a propósito, eligiendo "Sin categoría").
  const [categoriaId, setCategoriaId] = useState(() => gasto.categoriaId ?? '');
  // Precargada con la fecha actual del gasto — mismo criterio que
  // categoriaId arriba: abrir y guardar sin tocarla no debe re-fecharlo
  // a hoy por accidente.
  const [fechaEfectiva, setFechaEfectiva] = useState(() => gasto.fechaEfectiva);
  // Hallazgo del pase de QA/UX: un monto inválido no debe fallar en
  // silencio — este formulario inline usa useState simple, no RHF+Zod
  // como FormularioGasto, así que el mensaje se arma a mano aquí.
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const { data: categorias } = useCategorias();
  const editarGasto = useEditarGasto();
  const eliminarGasto = useEliminarGasto();

  const categoriaDelGasto = categorias?.find((c) => c.id === gasto.categoriaId);
  const nombreCategoria = categoriaDelGasto?.nombre;
  const Icono = iconoCategoria(nombreCategoria, categoriaDelGasto?.icono);

  function guardar() {
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) {
      setErrorValidacion('El monto debe ser mayor a cero');
      return;
    }
    setErrorValidacion(null);
    editarGasto.mutate(
      {
        gastoId: gasto.id,
        monto: { valorMinimo: Math.round(valor * 100), moneda: gasto.monto.moneda },
        categoriaId: categoriaId || undefined,
        fechaEfectiva,
      },
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
        <Input value={fechaEfectiva} onChange={(evento) => setFechaEfectiva(evento.target.value)} type="date" className="w-40" />
        <div className="w-40">
          <SelectorCategoria value={categoriaId} onChange={setCategoriaId} />
        </div>
        <Button size="sm" onClick={guardar} disabled={editarGasto.isPending}>
          {editarGasto.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            editarGasto.reset();
            setErrorValidacion(null);
            setEditando(false);
          }}
        >
          Cancelar
        </Button>
        {(errorValidacion ?? editarGasto.error?.message) && (
          <p className="text-destructive w-full text-sm">{errorValidacion ?? editarGasto.error?.message}</p>
        )}
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 border-b py-3 last:border-b-0">
      <div className="bg-secondary flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl">
        <Icono size={16} className="text-secondary-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{formatearMonto(gasto.monto)}</p>
        <p className="text-muted-foreground text-sm">
          {gasto.fechaEfectiva}
          {nombreCategoria ? ` — ${nombreCategoria}` : ''}
          {gasto.nota ? ` — ${gasto.nota}` : ''}
          {gasto.esRecurrente ? ' — automático' : ''}
        </p>
        {eliminarGasto.isError && <p className="text-destructive text-sm">{eliminarGasto.error.message}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            // Sin esto, un error de "Eliminar" fallido se quedaba visible
            // en esta fila aunque la edición que siguiera funcionara bien
            // — el estado de error de una mutation no se limpia solo
            // hasta que esa MISMA mutation se vuelve a llamar.
            eliminarGasto.reset();
            setEditando(true);
          }}
        >
          Editar
        </Button>
        <BotonConfirmar
          variant="outline"
          size="sm"
          pregunta="¿Eliminar este gasto?"
          onConfirmar={() => {
            editarGasto.reset();
            eliminarGasto.mutate(gasto.id);
          }}
          disabled={eliminarGasto.isPending}
        >
          Eliminar
        </BotonConfirmar>
      </div>
    </li>
  );
}
