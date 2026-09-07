import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';

interface Identidad {
  usuarioId: string;
  tenantId: string;
}

/**
 * Placeholder del punto 1: solo confirma que el login real produce un
 * token que el backend acepta y resuelve a una identidad — la prueba
 * vertical mínima de que el cableado funciona. Se reemplaza por la
 * pantalla real de "disponible" en el punto 2 (ver README del frontend).
 */
export function Home() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<Identidad>('/me'),
  });

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Korly</h1>
      {isLoading && <p className="text-muted-foreground">Cargando…</p>}
      {error && <p className="text-destructive">{(error as Error).message}</p>}
      {data && (
        <p className="text-muted-foreground">
          Sesión resuelta — tenant <code className="text-foreground">{data.tenantId}</code>
        </p>
      )}
      <Button variant="outline" onClick={() => supabase.auth.signOut()}>
        Cerrar sesión
      </Button>
    </div>
  );
}
