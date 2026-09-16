import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export interface Preferencias {
  recibirRecordatorios: boolean;
}

export function usePreferencias() {
  return useQuery({
    queryKey: ['preferencias'],
    queryFn: () => apiFetch<Preferencias>('/preferencias'),
  });
}
