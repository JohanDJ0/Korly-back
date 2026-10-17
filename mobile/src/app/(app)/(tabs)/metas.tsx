import { Plus } from 'lucide-react-native';
import { useState } from 'react';

import { FilaMeta } from '@/components/FilaMeta';
import { Boton, Campo, Cargando, Encabezado, HojaInferior, Pantalla, TextoError, TextoTenue } from '@/components/ui';
import { useCrearMeta } from '@/hooks/use-crear-meta';
import { useMetas } from '@/hooks/use-metas';
import { pesosACentavos } from '@/lib/dinero';
import { colores } from '@/lib/tema';

/** Igual que frontend/src/routes/Metas.tsx: sin quincena activa se pueden crear y ver metas; solo aportar o pasar exigen una. */
export default function Metas() {
  const { data: metas, isLoading, error } = useMetas();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  return (
    <>
      <Pantalla>
        <Encabezado titulo="Metas de ahorro" />
        {isLoading && <Cargando />}
        {error && <TextoError>{error.message}</TextoError>}
        {metas?.length === 0 && <TextoTenue>Todavía no tienes ninguna meta.</TextoTenue>}
        {metas?.map((meta) => (
          <FilaMeta key={meta.id} meta={meta} />
        ))}
        <Boton onPress={() => setMostrarFormulario(true)} icono={<Plus size={17} color={colores.primarioTexto} strokeWidth={2.5} />}>
          Nueva meta
        </Boton>
      </Pantalla>

      {mostrarFormulario && (
        <HojaInferior titulo="Nueva meta" onCerrar={() => setMostrarFormulario(false)}>
          <FormularioMeta onCreada={() => setMostrarFormulario(false)} />
        </HojaInferior>
      )}
    </>
  );
}

function FormularioMeta({ onCreada }: { onCreada: () => void }) {
  const crearMeta = useCrearMeta();
  const [nombre, setNombre] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [errores, setErrores] = useState<{ nombre?: string; objetivo?: string }>({});

  function crear() {
    const centavos = pesosACentavos(objetivo);
    const nuevos = {
      nombre: nombre.trim().length === 0 ? 'Ponle un nombre a tu meta' : undefined,
      objetivo: centavos === null ? 'El objetivo debe ser mayor a cero' : undefined,
    };
    setErrores(nuevos);
    if (nuevos.nombre || nuevos.objetivo || centavos === null) return;
    crearMeta.mutate({ nombre: nombre.trim(), montoObjetivo: { valorMinimo: centavos, moneda: 'MXN' } }, { onSuccess: onCreada });
  }

  return (
    <>
      <Campo etiqueta="¿Para qué estás ahorrando?" value={nombre} onChangeText={setNombre} autoFocus error={errores.nombre} />
      <Campo etiqueta="Objetivo" value={objetivo} onChangeText={setObjetivo} keyboardType="decimal-pad" error={errores.objetivo} />
      {crearMeta.isError && <TextoError>{crearMeta.error.message}</TextoError>}
      <Boton onPress={crear} cargando={crearMeta.isPending}>
        Crear meta
      </Boton>
    </>
  );
}
