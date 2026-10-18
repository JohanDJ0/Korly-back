// Copia de frontend/src/hooks/use-registrar-cargo.ts (sin cambios; regenerar con mobile/herramientas/copiar-de-la-web.mjs). Fase 3: paquete compartido.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MensualidadCargo } from '@/hooks/use-cargos-tarjeta';
import type { MontoDto } from '@/lib/dinero';

interface RegistrarCargoInput {
  tarjetaId: string;
  descripcion: string;
  monto: MontoDto;
  numeroPlazos: number;
  categoriaId?: string;
  fechaCompra?: string;
}

interface CargoRegistrado {
  id: string;
  mensualidades: MensualidadCargo[];
}

/**
 * Invalida tarjetas (el crédito disponible bajó) y el detalle de cargos de ESA tarjeta. Normalmente el cargo no toca el
 * disponible (solo las mensualidades al vencer), pero si una mensualidad vence dentro de la quincena activa el backend la
 * aplica al registrar (registrar-cargo.ts): por eso también se refrescan el disponible, el desglose y los pagos aplicados.
 */
export function useRegistrarCargo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tarjetaId, ...body }: RegistrarCargoInput) =>
      apiFetch<CargoRegistrado>(`/tarjetas/${tarjetaId}/cargos`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (_datos, { tarjetaId }) => {
      void queryClient.invalidateQueries({ queryKey: ['tarjetas'] });
      void queryClient.invalidateQueries({ queryKey: ['cargos-tarjeta', tarjetaId] });
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
      void queryClient.invalidateQueries({ queryKey: ['desglose'] });
      void queryClient.invalidateQueries({ queryKey: ['pagos-tarjeta-periodo'] });
    },
  });
}
