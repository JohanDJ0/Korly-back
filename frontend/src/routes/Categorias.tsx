import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilaCategoria } from '@/components/FilaCategoria';
import { PageHeader } from '@/components/PageHeader';
import { useCategorias } from '@/hooks/use-categorias';
import { useCrearCategoria } from '@/hooks/use-crear-categoria';

/**
 * Antes de esto, la única forma de crear una categoría personalizada
 * era "+ Nueva categoría…" dentro de SelectorCategoria.tsx (al capturar
 * un gasto) — no había ninguna pantalla para verlas todas ni para
 * eliminar una que sobre. Mismo patrón que Tarjetas.tsx/Metas.tsx.
 */
export function Categorias() {
  const { data: categorias, isLoading, error } = useCategorias();
  const crearCategoria = useCrearCategoria();
  const [nombreNueva, setNombreNueva] = useState('');

  function crear() {
    const nombre = nombreNueva.trim();
    if (nombre.length === 0) return;
    crearCategoria.mutate(nombre, { onSuccess: () => setNombreNueva('') });
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col gap-4 pb-8">
      <PageHeader titulo="Categorías" />

      <div className="flex flex-col gap-4 px-5">
        {isLoading && <p className="text-muted-foreground">Cargando…</p>}
        {error && <p className="text-destructive">{error.message}</p>}

        {categorias && (
          <ul className="flex flex-col gap-2.5">
            {categorias.map((categoria) => (
              <FilaCategoria key={categoria.id} categoria={categoria} />
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <Input
            value={nombreNueva}
            onChange={(evento) => setNombreNueva(evento.target.value)}
            onKeyDown={(evento) => evento.key === 'Enter' && crear()}
            placeholder="Nombre de la nueva categoría"
            className="h-11 flex-1 rounded-xl"
          />
          <Button onClick={crear} disabled={crearCategoria.isPending} className="h-11 rounded-xl">
            <Plus size={16} strokeWidth={2.5} />
            {crearCategoria.isPending ? 'Creando…' : 'Crear'}
          </Button>
        </div>
        {crearCategoria.isError && <p className="text-destructive text-sm">{crearCategoria.error.message}</p>}
      </div>
    </div>
  );
}
