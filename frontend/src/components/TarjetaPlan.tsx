import { Bell, Check, Crown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAvisoPro } from '@/hooks/use-aviso-pro';
import { useCrearCheckout } from '@/hooks/use-crear-checkout';
import { useCrearPortal } from '@/hooks/use-crear-portal';
import type { Suscripcion } from '@/hooks/use-suscripcion';
import { formatearFecha } from '@/lib/fechas';

/**
 * Qué incluirá Korly Pro, tal como se definió en `docs/plan-pro.md` (ahí está
 * el porqué de cada punto y cuáles ya existen). Sin precios a propósito: hasta
 * que haya cobro, esta tarjeta solo cuenta qué viene.
 */
const GRUPOS_PRO = [
  {
    titulo: 'PARA COMPARTIR',
    ventajas: [
      { nombre: 'Presupuesto en pareja o familia', detalle: 'dos personas llevan juntas la misma quincena: las dos registran gastos y ven cuánto les queda.' },
      { nombre: 'Metas en común', detalle: 'cada quien aporta desde su cuenta a la misma meta —el viaje, el enganche, el fondo de emergencia— y las dos ven cómo avanza.' },
    ],
  },
  {
    titulo: 'PARA IR MÁS LEJOS',
    ventajas: [
      { nombre: 'Alertas de ritmo', detalle: 'te avisa a tiempo si vas gastando más rápido de lo que alcanza tu quincena.' },
      { nombre: 'Metas sin límite', detalle: 'el plan gratuito incluye 2.' },
      { nombre: 'Historial completo', detalle: 'todas tus quincenas, no solo los últimos 12 meses.' },
      { nombre: 'Exportar a CSV', detalle: 'tus gastos e ingresos para tu contador o tu hoja de cálculo.' },
    ],
  },
] as const;

/**
 * Sección "Plan" de Ajustes. Mientras `cobrosHabilitados` sea falso (Korly
 * Pro todavía no se vende) NO hay botones de pago ni precios: se explica qué
 * traerá Pro y se ofrece "Avísame", que solo guarda la petición. El servidor
 * también rechaza el checkout en ese estado — ocultar el botón no basta.
 * Cuando se prendan los cobros, reaparecen los botones de Stripe sin tocar nada más.
 */
export function TarjetaPlan({ suscripcion }: { suscripcion: Suscripcion }) {
  const crearCheckout = useCrearCheckout();
  const crearPortal = useCrearPortal();
  const { pedir, cancelar } = useAvisoPro();

  const esPro = suscripcion.plan === 'pro';
  const proProximamente = !esPro && !suscripcion.cobrosHabilitados;
  const pidioAviso = suscripcion.avisoProSolicitadoEn !== null;
  const errorDeCobro = crearCheckout.error ?? crearPortal.error;

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">PLAN</h2>
      <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-3.5">
        <div className="flex items-center gap-3">
          <div className="bg-brand-gold/15 flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[11px]">
            <Crown size={17} className="text-brand-gold-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium">{esPro ? 'Korly Pro' : 'Plan gratuito'}</div>
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
          <p className="rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-700">Actualiza tu método de pago para no perder el acceso a Pro.</p>
        )}

        {proProximamente && (
          <div className="bg-secondary/60 flex flex-col gap-3 rounded-xl p-3">
            <div>
              <div className="text-[13px] font-semibold">Korly Pro llegará pronto</div>
              <p className="text-muted-foreground text-[12.5px]">Para cuando el dinero ya no es solo tuyo, o quieres ir más lejos con tus quincenas.</p>
            </div>

            {GRUPOS_PRO.map((grupo) => (
              <div key={grupo.titulo} className="flex flex-col gap-1.5">
                <h3 className="text-muted-foreground text-[11.5px] font-semibold tracking-wide">{grupo.titulo}</h3>
                <ul className="flex flex-col gap-2">
                  {grupo.ventajas.map((ventaja) => (
                    <li key={ventaja.nombre} className="flex items-start gap-2">
                      <Check size={14} className="mt-0.5 shrink-0" />
                      <div className="text-[12.5px]">
                        <span className="font-medium">{ventaja.nombre}</span>
                        <span className="text-muted-foreground"> — {ventaja.detalle}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {pidioAviso ? (
              <div className="flex flex-col items-start gap-1">
                <p className="text-[12.5px] font-medium">Listo, te avisaremos por correo cuando esté disponible.</p>
                <Button variant="ghost" size="sm" className="text-muted-foreground -ml-2 h-8 rounded-xl px-2" onClick={() => cancelar.mutate()} disabled={cancelar.isPending}>
                  {cancelar.isPending ? 'Quitando…' : 'Ya no me avises'}
                </Button>
              </div>
            ) : (
              <Button className="h-10 rounded-xl" onClick={() => pedir.mutate()} disabled={pedir.isPending}>
                <Bell size={15} />
                {pedir.isPending ? 'Guardando…' : 'Avísame cuando esté disponible'}
              </Button>
            )}
            {(pedir.isError || cancelar.isError) && <p className="text-destructive text-sm">{(pedir.error ?? cancelar.error)?.message}</p>}
          </div>
        )}

        {esPro && suscripcion.cobrosHabilitados && (
          <Button variant="outline" className="h-10 rounded-xl" onClick={() => crearPortal.mutate()} disabled={crearPortal.isPending}>
            {crearPortal.isPending ? 'Abriendo…' : 'Gestionar suscripción'}
          </Button>
        )}

        {!esPro && suscripcion.cobrosHabilitados && (
          <div className="flex gap-2">
            <Button className="h-10 flex-1 rounded-xl" onClick={() => crearCheckout.mutate('mensual')} disabled={crearCheckout.isPending}>
              Pro — $89/mes
            </Button>
            <Button variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => crearCheckout.mutate('anual')} disabled={crearCheckout.isPending}>
              Pro — $790/año
            </Button>
          </div>
        )}
        {errorDeCobro && <p className="text-destructive text-sm">{errorDeCobro.message}</p>}
      </div>
    </section>
  );
}
