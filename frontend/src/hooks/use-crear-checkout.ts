import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

/**
 * Redirige a la página de Checkout hospedada por Stripe — no hay
 * formulario de tarjeta propio que construir. El estado real (plan,
 * trial, etc.) llega después por el webhook (backend/README.md,
 * "Suscripciones"), nunca desde esta respuesta.
 */
export function useCrearCheckout() {
  return useMutation({
    mutationFn: (intervalo: 'mensual' | 'anual') => apiFetch<{ url: string }>('/suscripcion/checkout', { method: 'POST', body: JSON.stringify({ intervalo }) }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
}
