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

/** Invalida tarjetas (el crédito disponible bajó) y el detalle de cargos de ESA tarjeta — nunca el disponible del periodo: el cargo no lo toca (solo las mensualidades al vencer, ver backend/README.md). */
export function useRegistrarCargo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tarjetaId, ...body }: RegistrarCargoInput) =>
      apiFetch<CargoRegistrado>(`/tarjetas/${tarjetaId}/cargos`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (_datos, { tarjetaId }) => {
      void queryClient.invalidateQueries({ queryKey: ['tarjetas'] });
      void queryClient.invalidateQueries({ queryKey: ['cargos-tarjeta', tarjetaId] });
    },
  });
}
