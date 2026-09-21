import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { useCrearPeriodo } from '@/hooks/use-crear-periodo';
import { useDecidirSobrante } from '@/hooks/use-decidir-sobrante';
import { useMetas } from '@/hooks/use-metas';
import { useResumen } from '@/hooks/use-resumen';
import { formatearMonto } from '@/lib/dinero';
import { cn } from '@/lib/utils';

/**
 * Resumen inmutable de un periodo cerrado (modelo-dominio.md §3). Un
 * sobrante negativo es un déficit — ya se arrastró automático al
 * cerrar, sin pedir decisión (§3: "no existe la opción 'ahorrar' para
 * un déficit"); solo un sobrante positivo llega aquí con
 * `decisionSobrante: 'pendiente'`.
 */
export function Resumen() {
  const { periodoId } = useParams<{ periodoId: string }>();
  const { data: resumen, isLoading, error } = useResumen(periodoId);
  const { data: metas } = useMetas();
  const decidirSobrante = useDecidirSobrante();
  const crearPeriodo = useCrearPeriodo();
  const navigate = useNavigate();
  const [mostrarSelectorMeta, setMostrarSelectorMeta] = useState(false);
  const [metaSeleccionada, setMetaSeleccionada] = useState('');

  const esDeficit = resumen ? resumen.sobrante.valorMinimo < 0 : false;

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col gap-4 pb-8 sm:max-w-2xl sm:px-8 sm:pt-8">
      <PageHeader titulo="Resumen del periodo" />

      <div className="flex flex-col gap-4 px-5 sm:px-0">
        {isLoading && <p className="text-muted-foreground">Cargando…</p>}
        {error && <p className="text-destructive">{error.message}</p>}

        {resumen && (
          <>
            <div className="bg-hero text-hero-foreground flex flex-col gap-3.5 rounded-3xl px-5.5 py-6">
              <p className="text-hero-foreground-muted text-sm font-medium">{esDeficit ? 'Déficit del periodo' : 'Sobrante del periodo'}</p>
              <p className={cn('font-display text-[44px] leading-none font-extrabold tracking-tight tabular-nums', esDeficit && 'text-red-400')}>
                {formatearMonto(resumen.sobrante)}
              </p>

              <div className="my-1 h-px bg-white/10" />

              <div className="flex items-center">
                <div className="flex-1">
                  <div className="text-hero-foreground-muted text-[11.5px]">Ingresos</div>
                  <div className="font-display mt-0.5 text-lg font-bold">{formatearMonto(resumen.totalIngresos)}</div>
                </div>
                <div className="h-7 w-px bg-white/10" />
                <div className="flex-1 text-right">
                  <div className="text-hero-foreground-muted text-[11.5px]">Gastado</div>
                  <div className="font-display mt-0.5 text-lg font-bold">{formatearMonto(resumen.totalGastado)}</div>
                </div>
              </div>
            </div>

            {resumen.decisionSobrante === 'pendiente' && (
              <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-4.5">
                <div>
                  <h2 className="font-display text-[15px] font-semibold">¿Qué hacemos con el sobrante?</h2>
                  <p className="text-muted-foreground mt-0.5 text-[12.5px]">Si no decides en unos días, se arrastra automático al periodo siguiente.</p>
                </div>

                <Button
                  className="h-11 rounded-xl"
                  onClick={() => decidirSobrante.mutate({ periodoId: resumen.periodoId, decision: 'arrastrar' })}
                  disabled={decidirSobrante.isPending}
                >
                  {decidirSobrante.isPending ? 'Guardando…' : 'Arrastrar al periodo siguiente'}
                </Button>

                {!mostrarSelectorMeta && (
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl"
                    disabled={decidirSobrante.isPending || metas?.length === 0}
                    title={metas?.length === 0 ? 'Primero crea una meta en "Ver metas"' : undefined}
                    onClick={() => setMostrarSelectorMeta(true)}
                  >
                    Ahorrar en una meta
                  </Button>
                )}

                {mostrarSelectorMeta && (
                  <div className="flex flex-col gap-2">
                    <select
                      value={metaSeleccionada}
                      onChange={(evento) => setMetaSeleccionada(evento.target.value)}
                      className="border-input h-11 w-full rounded-xl border bg-transparent px-3 text-sm outline-none"
                    >
                      <option value="">Elige una meta…</option>
                      {metas?.map((meta) => (
                        <option key={meta.id} value={meta.id}>
                          {meta.nombre}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <Button
                        className="h-10 flex-1 rounded-xl"
                        disabled={!metaSeleccionada || decidirSobrante.isPending}
                        onClick={() => decidirSobrante.mutate({ periodoId: resumen.periodoId, decision: 'ahorrar', metaId: metaSeleccionada })}
                      >
                        {decidirSobrante.isPending ? 'Guardando…' : 'Confirmar'}
                      </Button>
                      <Button variant="ghost" className="h-10 rounded-xl" onClick={() => setMostrarSelectorMeta(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
                {decidirSobrante.isError && <p className="text-destructive text-sm">{decidirSobrante.error.message}</p>}
              </div>
            )}

            {resumen.decisionSobrante === 'arrastrado' && (
              <p className="text-muted-foreground text-sm">{esDeficit ? 'Este déficit' : 'Este sobrante'} se arrastrará al periodo siguiente.</p>
            )}
            {resumen.decisionSobrante === 'ahorrado' && <p className="text-muted-foreground text-sm">Este sobrante se guardó como ahorro.</p>}

            <Button
              variant="secondary"
              className="h-11 rounded-xl"
              onClick={() => crearPeriodo.mutate(undefined, { onSuccess: () => navigate('/') })}
              disabled={crearPeriodo.isPending}
            >
              {crearPeriodo.isPending ? 'Creando…' : 'Crear periodo siguiente'}
            </Button>
            {crearPeriodo.isError && <p className="text-destructive text-sm">{crearPeriodo.error.message}</p>}
          </>
        )}
      </div>
    </div>
  );
}
