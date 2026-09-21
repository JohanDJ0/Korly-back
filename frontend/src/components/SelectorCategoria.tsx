import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCategorias } from '@/hooks/use-categorias';
import { useCrearCategoria } from '@/hooks/use-crear-categoria';

const VALOR_NUEVA_CATEGORIA = '__nueva__';

interface SelectorCategoriaProps {
  /** '' = sin categoría. */
  value: string;
  onChange: (categoriaId: string) => void;
  id?: string;
}

/**
 * Opcional siempre (CLAUDE.md: "categorías opcionales, nunca
 * obligatorias en la captura") — "Sin categoría" es la opción por
 * defecto, elegirla no exige ningún toque extra. La opción "+ Nueva
 * categoría…" evita mandar al usuario a una pantalla aparte solo para
 * crear una que le falte; al confirmarla, queda seleccionada de
 * inmediato en el mismo selector.
 */
export function SelectorCategoria({ value, onChange, id }: SelectorCategoriaProps) {
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
          className="w-40"
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
        {crearCategoria.isError && <p className="w-full text-sm text-destructive">{crearCategoria.error.message}</p>}
      </div>
    );
  }

  return (
    <select
      id={id}
      value={value}
      onChange={(evento) => {
        if (evento.target.value === VALOR_NUEVA_CATEGORIA) {
          setCreando(true);
        } else {
          onChange(evento.target.value);
        }
      }}
      className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"
    >
      <option value="">Sin categoría</option>
      {categorias?.map((categoria) => (
        <option key={categoria.id} value={categoria.id}>
          {categoria.nombre}
        </option>
      ))}
      <option value={VALOR_NUEVA_CATEGORIA}>+ Nueva categoría…</option>
    </select>
  );
}
