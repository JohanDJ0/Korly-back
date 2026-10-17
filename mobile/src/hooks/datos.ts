import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

// Mismos tipos y queryKeys que los hooks de la web (frontend/src/hooks/use-*.ts). En el spike viven juntos en un archivo;
// en la fase 3 pasan a un paquete compartido para no mantener dos copias.

export interface DisponibleSinIngreso {
  estado: 'sin_ingreso';
  periodoId: string;
  calculadoEn: string;
}

export interface DisponibleOk {
  estado: 'ok';
  periodoId: string;
  disponible: MontoDto;
  diasRestantes: number;
  cifraDiaria: MontoDto;
  gastadoHoy: MontoDto;
  huboActividadHoy: boolean;
  calculadoEn: string;
}

export type Disponible = DisponibleSinIngreso | DisponibleOk;

export function useDisponible(habilitado: boolean) {
  return useQuery({
    queryKey: ['disponible'],
    queryFn: () => apiFetch<Disponible>('/periodos/activo/disponible'),
    enabled: habilitado,
  });
}

export interface Categoria {
  id: string;
  nombre: string;
  esPredeterminada: boolean;
  icono: string | null;
}

export function useCategorias(habilitado: boolean) {
  return useQuery({
    queryKey: ['categorias'],
    queryFn: () => apiFetch<Categoria[]>('/categorias'),
    enabled: habilitado,
  });
}

export interface Atajo {
  id: string;
  nombre: string;
  monto: MontoDto;
  categoriaId: string | null;
}

export function useAtajos(habilitado: boolean) {
  return useQuery({
    queryKey: ['atajos-gasto'],
    queryFn: () => apiFetch<{ atajos: Atajo[]; limite: number }>('/atajos-gasto'),
    enabled: habilitado,
  });
}

interface RegistrarGastoInput {
  periodoId: string;
  monto: MontoDto;
  fechaEfectiva: string;
  categoriaId?: string;
  nota?: string;
}

export function useRegistrarGasto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ periodoId, ...body }: RegistrarGastoInput) =>
      apiFetch<{ id: string; movimientoId: string; periodoId: string }>(`/periodos/${periodoId}/gastos`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
      void queryClient.invalidateQueries({ queryKey: ['desglose'] });
      void queryClient.invalidateQueries({ queryKey: ['gastos'] });
    },
  });
}
