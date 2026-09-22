import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronRight, Crown, Repeat, Tag } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import { PageHeader } from '@/components/PageHeader';
import { useActualizarPreferencias } from '@/hooks/use-actualizar-preferencias';
import { useCrearCheckout } from '@/hooks/use-crear-checkout';
import { useCrearPortal } from '@/hooks/use-crear-portal';
import { usePreferencias } from '@/hooks/use-preferencias';
import { useSuscripcion } from '@/hooks/use-suscripcion';
import { formatearFecha } from '@/lib/fechas';
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
  const { data: suscripcion } = useSuscripcion();
  const crearCheckout = useCrearCheckout();
  const crearPortal = useCrearPortal();
  const [parametros] = useSearchParams();
  const resultadoCheckout = parametros.get('suscripcion');

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col sm:max-w-2xl sm:px-8 sm:pt-8">
      <PageHeader titulo="Ajustes" />

      <div className="flex flex-1 flex-col gap-5.5 px-5 pt-2 pb-4 sm:px-0 sm:pt-0">
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

        {resultadoCheckout === 'exito' && (
          <p className="bg-secondary text-secondary-foreground rounded-xl px-3.5 py-2.5 text-[13px]">Listo — tu suscripción se está confirmando.</p>
        )}

        {suscripcion && (
          <section className="flex flex-col gap-2.5">
            <h2 className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">PLAN</h2>
            <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-3.5">
              <div className="flex items-center gap-3">
                <div className="bg-brand-gold/15 flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[11px]">
                  <Crown size={17} className="text-brand-gold-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{suscripcion.plan === 'pro' ? 'Korly Pro' : 'Plan gratuito'}</div>
                  <div className="text-muted-foreground text-[12px]">
                    {suscripcion.estadoSuscripcion === 'trialing' && suscripcion.suscripcionVigenteHasta && `Prueba gratis hasta el ${formatearFecha(suscripcion.suscripcionVigenteHasta)}`}
                    {suscripcion.estadoSuscripcion === 'activa' && suscripcion.suscripcionVigenteHasta && `Vigente hasta el ${formatearFecha(suscripcion.suscripcionVigenteHasta)}`}
                    {suscripcion.estadoSuscripcion === 'pago_pendiente' && 'Hubo un problema con tu último cobro — actualiza tu método de pago'}
                    {suscripcion.estadoSuscripcion === 'cancelada' && 'Tu suscripción terminó'}
                    {suscripcion.plan === 'free' && !suscripcion.estadoSuscripcion && 'Categorías, metas y recordatorios básicos, sin costo'}
                  </div>
                </div>
              </div>

              {suscripcion.estadoSuscripcion === 'pago_pendiente' && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                  Actualiza tu método de pago para no perder el acceso a Pro.
                </p>
              )}

              {suscripcion.plan === 'pro' ? (
                <Button variant="outline" className="h-10 rounded-xl" onClick={() => crearPortal.mutate()} disabled={crearPortal.isPending}>
                  {crearPortal.isPending ? 'Abriendo…' : 'Gestionar suscripción'}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button className="h-10 flex-1 rounded-xl" onClick={() => crearCheckout.mutate('mensual')} disabled={crearCheckout.isPending}>
                    Pro — $89/mes
                  </Button>
                  <Button variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => crearCheckout.mutate('anual')} disabled={crearCheckout.isPending}>
                    Pro — $790/año
                  </Button>
                </div>
              )}
              {(crearCheckout.isError || crearPortal.isError) && (
                <p className="text-destructive text-sm">{(crearCheckout.error ?? crearPortal.error)?.message}</p>
              )}
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

      <div className="px-5 pb-6 sm:px-0">
        <Button
          variant="outline"
          className="border-destructive/25 text-destructive hover:bg-destructive/5 w-full rounded-2xl py-3 sm:w-auto"
          onClick={() => supabase.auth.signOut()}
        >
          Cerrar sesión
        </Button>
      </div>

      <BottomNav />
    </div>
  );
}
