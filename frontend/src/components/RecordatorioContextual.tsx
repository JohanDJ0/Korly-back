import { Card, CardContent } from '@/components/ui/card';
import type { DisponibleOk } from '@/hooks/use-disponible';
import { formatearMonto } from '@/lib/dinero';

interface RecordatorioContextualProps {
  disponible: DisponibleOk;
}

/**
 * Recordatorios contextuales (documento-maestro-v2.md §13.4, "núcleo,
 * no accesorio") — alcance elegido con el usuario: solo aviso dentro
 * de la app por ahora. Los canales reales (email + web push que pide
 * el documento para el MVP web) requieren infraestructura que todavía
 * no existe (proveedor de email, VAPID + service worker, y algún
 * mecanismo de cron — hoy el backend es puro request/response) — se
 * agregan después, cuando exista un proveedor.
 *
 * **Regla 1 ("cada notificación entrega valor por sí sola"):** siempre
 * trae la cifra accionable, nunca solo el hecho de "no has registrado".
 * **Regla 2 ("se silencia sola si ya hubo actividad"):** solo se
 * muestra si `gastadoHoy` es 0 — en cuanto se registra un gasto hoy,
 * desaparece sin que nadie la cierre a mano.
 * **Regla 4 (alertas de ritmo):** deliberadamente NO duplica el caso
 * "ya te excediste hoy" — `CifraDisponible.tsx` ya lo muestra como el
 * titular principal en rojo; repetirlo aquí sería "regañar" dos veces
 * por lo mismo.
 * **Regla 5 (nunca con datos incompletos):** el tipo `DisponibleOk` ya
 * excluye `sin_ingreso` a nivel de TypeScript — este componente ni
 * siquiera puede recibir ese estado.
 *
 * Reglas 3 ("frecuencia decreciente") y "ventana adaptada al patrón
 * del usuario" no aplican a un aviso in-app recalculado en cada
 * carga — son reglas de cadencia de *envío* (push/email), sin sentido
 * sin un historial de envíos que todavía no existe.
 */
export function RecordatorioContextual({ disponible }: RecordatorioContextualProps) {
  const yaSeExcedioHoy = disponible.cifraDiaria.valorMinimo < 0;
  const sinActividadHoy = disponible.gastadoHoy.valorMinimo === 0;
  if (!sinActividadHoy || yaSeExcedioHoy) return null;

  return (
    <Card className="w-full max-w-sm border-blue-500/50 bg-blue-50 dark:bg-blue-950/30">
      <CardContent className="pt-6">
        <p className="text-sm">
          Te quedan {disponible.diasRestantes} día{disponible.diasRestantes === 1 ? '' : 's'} con{' '}
          <span className="font-semibold">{formatearMonto(disponible.disponible)}</span> disponible — hoy puedes gastar hasta{' '}
          <span className="font-semibold">{formatearMonto(disponible.cifraDiaria)}</span>.
        </p>
      </CardContent>
    </Card>
  );
}
