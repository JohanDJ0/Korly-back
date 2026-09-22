import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

/** Portal de facturación hospedado por Stripe: cancelar, cambiar método de pago, ver facturas. */
export function useCrearPortal() {
  return useMutation({
    mutationFn: () => apiFetch<{ url: string }>('/suscripcion/portal', { method: 'POST' }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
}
