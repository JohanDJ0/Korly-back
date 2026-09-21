import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronRight, Repeat, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import { PageHeader } from '@/components/PageHeader';
import { useActualizarPreferencias } from '@/hooks/use-actualizar-preferencias';
import { usePreferencias } from '@/hooks/use-preferencias';
import { supabase } from '@/lib/supabase';

/**
 * Primera y única preferencia hoy (documento-maestro-v2.md §13.4):
 * apagar los recordatorios por correo. `Cerrar sesión` vivía antes al
 * fondo de Home.tsx — esta es conceptualmente su casa (un ajuste de
 * cuenta, no una acción de la pantalla principal).
 *
 * Sin sección de plan/facturación a propósito: `tenants.plan` existe en
 * el backend (documento-maestro-v2.md §9.2) pero ningún endpoint lo
 * expone todavía a este frontend (`GET /me` solo da usuarioId/tenantId)
 * — mostrarlo aquí sería inventar un dato que no se puede verificar.
 */
export function Ajustes() {
  const { data: preferencias, isLoading, error } = usePreferencias();
  const actualizarPreferencias = useActualizarPreferencias();
  const { data: usuario } = useQuery({
    queryKey: ['usuario-actual'],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col md:max-w-2xl md:px-8 md:pt-8">
      <PageHeader titulo="Ajustes" />

      <div className="flex flex-1 flex-col gap-5.5 px-5 pt-2 pb-4 md:px-0 md:pt-0">
        {isLoading && <p className="text-muted-foreground">Cargando…</p>}
        {error && <p className="text-destructive">{error.message}</p>}

        {usuario?.email && (
          <section className="flex flex-col gap-2.5">
            <h2 className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">CUENTA</h2>
            <div className="border-border bg-card flex items-center gap-3 rounded-2xl border p-3.5">
              <div className="bg-secondary text-secondary-foreground font-display flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-full text-[15px] font-bold">
                {usuario.email[0]?.toUpperCase()}
              </div>
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{usuario.email}</span>
            </div>
          </section>
        )}

        {preferencias && (
          <section className="flex flex-col gap-2.5">
            <h2 className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">NOTIFICACIONES</h2>
            <label className="border-border bg-card flex items-center gap-3 rounded-2xl border p-3.5">
              <div className="bg-brand-gold/15 flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[11px]">
                <Bell size={17} className="text-brand-gold-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium">Recordatorios por correo</div>
                <div className="text-muted-foreground text-[12px]">Un resumen diario si no has registrado nada.</div>
              </div>
              <input
                type="checkbox"
                checked={preferencias.recibirRecordatorios}
                onChange={(evento) => actualizarPreferencias.mutate(evento.target.checked)}
                disabled={actualizarPreferencias.isPending}
                className="accent-primary h-5 w-9 shrink-0"
              />
            </label>
            {actualizarPreferencias.isError && <p className="text-destructive text-sm">{actualizarPreferencias.error.message}</p>}
          </section>
        )}

        <section className="flex flex-col gap-2.5">
          <h2 className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">DATOS</h2>
          <div className="border-border bg-card flex flex-col divide-y rounded-2xl border">
            <Link to="/categorias" className="flex items-center gap-3 p-3.5">
              <div className="bg-secondary flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[11px]">
                <Tag size={17} className="text-secondary-foreground" />
              </div>
              <span className="flex-1 text-[14px] font-medium">Categorías</span>
              <ChevronRight size={16} className="text-muted-foreground" />
            </Link>
            <Link to="/recurrentes" className="flex items-center gap-3 p-3.5">
              <div className="bg-secondary flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[11px]">
                <Repeat size={17} className="text-secondary-foreground" />
              </div>
              <span className="flex-1 text-[14px] font-medium">Gastos recurrentes</span>
              <ChevronRight size={16} className="text-muted-foreground" />
            </Link>
          </div>
        </section>
      </div>

      <div className="px-5 pb-6 md:px-0">
        <Button
          variant="outline"
          className="border-destructive/25 text-destructive hover:bg-destructive/5 w-full rounded-2xl py-3 md:w-auto"
          onClick={() => supabase.auth.signOut()}
        >
          Cerrar sesión
        </Button>
      </div>

      <BottomNav />
    </div>
  );
}
