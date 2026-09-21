import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilaCategoria } from '@/components/FilaCategoria';
import { IconoPicker } from '@/components/IconoPicker';
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
  // '' = todavía no elige ninguno — se manda como `undefined` (sin
  // ícono explícito, cae al emparejamiento por palabra clave de
  // siempre) en vez de forzar a elegir uno para poder crear la categoría.
  const [iconoNuevo, setIconoNuevo] = useState('');

  function crear() {
    const nombre = nombreNueva.trim();
    if (nombre.length === 0) return;
    crearCategoria.mutate(
      { nombre, icono: iconoNuevo || undefined },
      {
        onSuccess: () => {
          setNombreNueva('');
          setIconoNuevo('');
        },
      }
    );
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col gap-4 pb-8 sm:max-w-2xl sm:px-8 sm:pt-8 lg:max-w-4xl">
      <PageHeader titulo="Categorías" />

      <div className="flex flex-col gap-4 px-5 sm:px-0">
        {isLoading && <p className="text-muted-foreground">Cargando…</p>}
        {error && <p className="text-destructive">{error.message}</p>}

        {categorias && (
          <ul className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 xl:grid-cols-3">
            {categorias.map((categoria) => (
              <FilaCategoria key={categoria.id} categoria={categoria} />
            ))}
          </ul>
        )}

        <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-4 sm:max-w-md">
          <p className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">NUEVA CATEGORÍA</p>
          <Input
            value={nombreNueva}
            onChange={(evento) => setNombreNueva(evento.target.value)}
            onKeyDown={(evento) => evento.key === 'Enter' && crear()}
            placeholder="Nombre de la categoría"
            className="h-11 rounded-xl"
          />
          <IconoPicker value={iconoNuevo || null} onChange={setIconoNuevo} />
          <Button onClick={crear} disabled={crearCategoria.isPending} className="h-11 rounded-xl">
            <Plus size={16} strokeWidth={2.5} />
            {crearCategoria.isPending ? 'Creando…' : 'Crear categoría'}
          </Button>
          {crearCategoria.isError && <p className="text-destructive text-sm">{crearCategoria.error.message}</p>}
        </div>
      </div>
    </div>
  );
}
