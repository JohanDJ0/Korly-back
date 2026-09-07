import { Link, useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCrearPeriodo } from '@/hooks/use-crear-periodo';
import { useDecidirSobrante } from '@/hooks/use-decidir-sobrante';
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
  const decidirSobrante = useDecidirSobrante();
  const crearPeriodo = useCrearPeriodo();
  const navigate = useNavigate();

  const esDeficit = resumen ? resumen.sobrante.valorMinimo < 0 : false;

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">← Volver</Link>
        </Button>
        <h1 className="text-xl font-semibold">Resumen del periodo</h1>
      </div>

      {isLoading && <p className="text-muted-foreground">Cargando…</p>}
      {error && <p className="text-destructive">{error.message}</p>}

      {resumen && (
        <>
          <Card>
            <CardContent className="flex flex-col gap-2 pt-6">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ingresos</span>
                <span className="font-medium">{formatearMonto(resumen.totalIngresos)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gastado</span>
                <span className="font-medium">{formatearMonto(resumen.totalGastado)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t pt-2">
                <span className="text-muted-foreground">{esDeficit ? 'Déficit' : 'Sobrante'}</span>
                <span className={cn('font-semibold', esDeficit && 'text-destructive')}>{formatearMonto(resumen.sobrante)}</span>
              </div>
            </CardContent>
          </Card>

          {resumen.decisionSobrante === 'pendiente' && (
            <Card>
              <CardHeader>
                <CardTitle>¿Qué hacemos con el sobrante?</CardTitle>
                <CardDescription>Si no decides en unos días, se arrastra automático al periodo siguiente.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button
                  onClick={() => decidirSobrante.mutate({ periodoId: resumen.periodoId, decision: 'arrastrar' })}
                  disabled={decidirSobrante.isPending}
                >
                  {decidirSobrante.isPending ? 'Guardando…' : 'Arrastrar al periodo siguiente'}
                </Button>
                <Button variant="outline" disabled title="Todavía no existen las metas de ahorro">
                  Ahorrar (próximamente)
                </Button>
                {decidirSobrante.isError && <p className="text-sm text-destructive">{decidirSobrante.error.message}</p>}
              </CardContent>
            </Card>
          )}

          {resumen.decisionSobrante === 'arrastrado' && (
            <p className="text-sm text-muted-foreground">
              {esDeficit ? 'Este déficit' : 'Este sobrante'} se arrastrará al periodo siguiente.
            </p>
          )}
          {resumen.decisionSobrante === 'ahorrado' && <p className="text-sm text-muted-foreground">Este sobrante se guardó como ahorro.</p>}

          <Button
            variant="secondary"
            onClick={() => crearPeriodo.mutate(undefined, { onSuccess: () => navigate('/') })}
            disabled={crearPeriodo.isPending}
          >
            {crearPeriodo.isPending ? 'Creando…' : 'Crear periodo siguiente'}
          </Button>
          {crearPeriodo.isError && <p className="text-sm text-destructive">{crearPeriodo.error.message}</p>}
        </>
      )}
    </div>
  );
}
