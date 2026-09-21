import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCategorias } from '@/hooks/use-categorias';
import { useCrearCategoria } from '@/hooks/use-crear-categoria';
import { iconoCategoria } from '@/lib/icono-categoria';
import { cn } from '@/lib/utils';

interface SelectorCategoriaChipsProps {
  /** '' = sin categoría. */
  value: string;
  onChange: (categoriaId: string) => void;
}

/**
 * Misma opcionalidad de siempre (CLAUDE.md: "categorías opcionales,
 * nunca obligatorias") y el mismo flujo de "+ Nueva categoría…" que
 * SelectorCategoria.tsx (el `<select>` nativo) — esta es la versión en
 * chips del rediseño, usada solo en FormularioGasto/HojaInferior.
 * SelectorCategoria.tsx se queda tal cual para FilaGasto.tsx (edición
 * inline en una fila angosta, donde un `<select>` sigue siendo lo
 * correcto).
 */
export function SelectorCategoriaChips({ value, onChange }: SelectorCategoriaChipsProps) {
  const { data: categorias } = useCategorias();
  const crearCategoria = useCrearCategoria();
  const [creando, setCreando] = useState(false);
  const [nombreNueva, setNombreNueva] = useState('');

  function confirmarNueva() {
    const nombre = nombreNueva.trim();
    if (nombre.length === 0) return;
    crearCategoria.mutate({ nombre }, {
      onSuccess: (nueva) => {
        onChange(nueva.id);
        setCreando(false);
        setNombreNueva('');
      },
    });
  }

  if (creando) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={nombreNueva}
          onChange={(evento) => setNombreNueva(evento.target.value)}
          placeholder="Nombre de la categoría"
          autoFocus
          className="flex-1"
        />
        <Button type="button" size="sm" onClick={confirmarNueva} disabled={crearCategoria.isPending}>
          {crearCategoria.isPending ? 'Creando…' : 'Crear'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            crearCategoria.reset();
            setCreando(false);
            setNombreNueva('');
          }}
        >
          Cancelar
        </Button>
        {crearCategoria.isError && <p className="text-destructive w-full text-sm">{crearCategoria.error.message}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
        {categorias?.map((categoria) => {
          const Icono = iconoCategoria(categoria.nombre, categoria.icono);
          const seleccionada = value === categoria.id;
          return (
            <button
              key={categoria.id}
              type="button"
              onClick={() => onChange(seleccionada ? '' : categoria.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium whitespace-nowrap',
                seleccionada ? 'bg-primary border-primary text-primary-foreground' : 'bg-card border-input text-foreground'
              )}
            >
              <Icono size={15} />
              {categoria.nombre}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setCreando(true)}
        className="text-primary flex items-center gap-1 self-start text-[12.5px] font-semibold"
      >
        <Plus size={13} strokeWidth={2.5} />
        Nueva categoría
      </button>
    </div>
  );
}
