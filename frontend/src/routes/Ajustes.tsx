import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronRight, Download, FileText, LogOut, Repeat, ShieldCheck, Tag, Zap } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import { BotonComentarios } from '@/components/BotonComentarios';
import { CambiarCorreo } from '@/components/CambiarCorreo';
import { CambiarPassword } from '@/components/CambiarPassword';
import { CerrarPeriodo } from '@/components/CerrarPeriodo';
import { EliminarCuenta } from '@/components/EliminarCuenta';
import { PageHeader } from '@/components/PageHeader';
import { TarjetaPlan } from '@/components/TarjetaPlan';
import { useActualizarPreferencias } from '@/hooks/use-actualizar-preferencias';
import { useDescargarDatos } from '@/hooks/use-descargar-datos';
import { usePreferencias } from '@/hooks/use-preferencias';
import { useSuscripcion } from '@/hooks/use-suscripcion';
import { supabase } from '@/lib/supabase';

/**
 * Primera y única preferencia hoy (documento-maestro-v2.md §13.4):
 * apagar los recordatorios por correo. `Cerrar sesión` vive en la tarjeta de
 * Cuenta (arriba), y `Cerrar periodo` en su propia sección, lejos de ella:
 * un usuario real pulsó el segundo creyendo que salía de su cuenta (ver
 * CerrarPeriodo.tsx). Nunca deben quedar juntos.
 *
 * La sección de plan vive en `TarjetaPlan`: mientras los cobros estén
 * apagados muestra "Korly Pro llegará pronto" + "Avísame" en vez de comprar.
 */
export function Ajustes() {
  const { data: preferencias, isLoading, error } = usePreferencias();
  const actualizarPreferencias = useActualizarPreferencias();
  const { data: usuario } = useQuery({
    queryKey: ['usuario-actual'],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });
  const { data: suscripcion } = useSuscripcion();
  const descargarDatos = useDescargarDatos();
  const [parametros] = useSearchParams();
  const resultadoCheckout = parametros.get('suscripcion');

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col sm:max-w-2xl sm:px-8 sm:pt-8">
      <PageHeader titulo="Ajustes" sinOjito />

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
              <Button variant="outline" size="sm" className="shrink-0 rounded-xl" onClick={() => supabase.auth.signOut()}>
                <LogOut size={14} />
                Cerrar sesión
              </Button>
            </div>
          </section>
        )}

        {resultadoCheckout === 'exito' && (
          <p className="bg-secondary text-secondary-foreground rounded-xl px-3.5 py-2.5 text-[13px]">Listo — tu suscripción se está confirmando.</p>
        )}

        {suscripcion && <TarjetaPlan suscripcion={suscripcion} />}

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
          <h2 className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">SEGURIDAD</h2>
          <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-3.5">
            <CambiarPassword />
            <CambiarCorreo />
          </div>
        </section>

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
            <Link to="/atajos" className="flex items-center gap-3 p-3.5">
              <div className="bg-secondary flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[11px]">
                <Zap size={17} className="text-secondary-foreground" />
              </div>
              <span className="flex-1 text-[14px] font-medium">Atajos de gasto</span>
              <ChevronRight size={16} className="text-muted-foreground" />
            </Link>
          </div>
        </section>
        <section className="flex flex-col gap-2.5">
          <h2 className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">PERIODO</h2>
          <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-3.5">
            <CerrarPeriodo />
          </div>
        </section>
        <section className="flex flex-col gap-2.5">
          <h2 className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">AYUDA</h2>
          <div className="border-border bg-card rounded-2xl border p-3.5">
            <BotonComentarios />
          </div>
        </section>
        <section className="flex flex-col gap-2.5">
          <h2 className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">PRIVACIDAD Y DATOS</h2>
          <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-3.5">
            <Link to="/privacidad" className="flex items-center gap-3">
              <div className="bg-secondary flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[11px]">
                <ShieldCheck size={17} className="text-secondary-foreground" />
              </div>
              <span className="flex-1 text-[14px] font-medium">Aviso de privacidad</span>
              <ChevronRight size={16} className="text-muted-foreground" />
            </Link>
            <Link to="/terminos" className="flex items-center gap-3">
              <div className="bg-secondary flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[11px]">
                <FileText size={17} className="text-secondary-foreground" />
              </div>
              <span className="flex-1 text-[14px] font-medium">Términos y condiciones</span>
              <ChevronRight size={16} className="text-muted-foreground" />
            </Link>
            <Button variant="outline" className="h-10 w-full rounded-xl" onClick={() => descargarDatos.mutate()} disabled={descargarDatos.isPending}>
              <Download size={15} />
              {descargarDatos.isPending ? 'Preparando…' : 'Descargar mis datos'}
            </Button>
            {descargarDatos.isError && <p className="text-destructive text-sm">{descargarDatos.error.message}</p>}
            <EliminarCuenta />
          </div>
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
