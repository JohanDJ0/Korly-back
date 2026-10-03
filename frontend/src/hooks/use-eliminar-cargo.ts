import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

interface EliminarCargoEntrada {
  tarjetaId: string;
  cargoId: string;
}

/** Corrige un cargo mal registrado (reversión, nunca hard delete — ver backend/README.md). */
export function useEliminarCargo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tarjetaId, cargoId }: EliminarCargoEntrada) => apiFetch<void>(`/tarjetas/${tarjetaId}/cargos/${cargoId}`, { method: 'DELETE' }),
    onSuccess: (_datos, { tarjetaId }) => {
      void queryClient.invalidateQueries({ queryKey: ['cargos-tarjeta', tarjetaId] });
      void queryClient.invalidateQueries({ queryKey: ['tarjetas'] });
    },
  });
}
