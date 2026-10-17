import { Plus } from 'lucide-react-native';
import { useState } from 'react';

import { FilaTarjeta } from '@/components/FilaTarjeta';
import { Boton, Campo, Cargando, Encabezado, HojaInferior, Pantalla, TextoError, TextoTenue } from '@/components/ui';
import { useCrearTarjeta } from '@/hooks/use-crear-tarjeta';
import { useTarjetas } from '@/hooks/use-tarjetas';
import { pesosACentavos } from '@/lib/dinero';
import { colores } from '@/lib/tema';

/** Igual que frontend/src/routes/Tarjetas.tsx: dar de alta una tarjeta y ver su deuda no depende de tener quincena activa. */
export default function Tarjetas() {
  const { data: tarjetas, isLoading, error } = useTarjetas();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  return (
    <>
      <Pantalla>
        <Encabezado titulo="Tarjetas de crédito" />
        {isLoading && <Cargando />}
        {error && <TextoError>{error.message}</TextoError>}
        {tarjetas?.length === 0 && <TextoTenue>Todavía no tienes ninguna tarjeta registrada.</TextoTenue>}
        {tarjetas?.map((tarjeta) => (
          <FilaTarjeta key={tarjeta.id} tarjeta={tarjeta} />
        ))}
        <Boton onPress={() => setMostrarFormulario(true)} icono={<Plus size={17} color={colores.primarioTexto} strokeWidth={2.5} />}>
          Nueva tarjeta
        </Boton>
      </Pantalla>

      {mostrarFormulario && (
        <HojaInferior titulo="Nueva tarjeta" onCerrar={() => setMostrarFormulario(false)}>
          <FormularioTarjeta onCreada={() => setMostrarFormulario(false)} />
        </HojaInferior>
      )}
    </>
  );
}

function FormularioTarjeta({ onCreada }: { onCreada: () => void }) {
  const crearTarjeta = useCrearTarjeta();
  const [nombre, setNombre] = useState('');
  const [limite, setLimite] = useState('');
  const [diaCorte, setDiaCorte] = useState('');
  const [diasParaPago, setDiasParaPago] = useState('20');
  const [errores, setErrores] = useState<Partial<Record<'nombre' | 'limite' | 'diaCorte' | 'diasParaPago', string>>>({});

  function guardar() {
    const centavos = pesosACentavos(limite);
    const corte = Number(diaCorte);
    const dias = Number(diasParaPago);
    const nuevos = {
      nombre: nombre.trim().length === 0 ? "Ponle un nombre (p. ej. 'BBVA Oro')" : undefined,
      limite: centavos === null ? 'El límite debe ser mayor a cero' : undefined,
      diaCorte: !Number.isInteger(corte) || corte < 1 || corte > 31 ? 'Debe estar entre 1 y 31' : undefined,
      diasParaPago: !Number.isInteger(dias) || dias <= 0 ? 'Debe ser un número positivo de días' : undefined,
    };
    setErrores(nuevos);
    if (Object.values(nuevos).some(Boolean) || centavos === null) return;
    crearTarjeta.mutate({ nombre: nombre.trim(), limiteCredito: { valorMinimo: centavos, moneda: 'MXN' }, diaCorte: corte, diasParaPago: dias }, { onSuccess: onCreada });
  }

  return (
    <>
      <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder="BBVA Oro, Santander Platino…" autoFocus error={errores.nombre} />
      <Campo etiqueta="Límite de crédito" value={limite} onChangeText={setLimite} keyboardType="decimal-pad" error={errores.limite} />
      <Campo etiqueta="Día de corte" value={diaCorte} onChangeText={setDiaCorte} keyboardType="number-pad" error={errores.diaCorte} />
      <Campo etiqueta="Días para pagar después del corte" value={diasParaPago} onChangeText={setDiasParaPago} keyboardType="number-pad" error={errores.diasParaPago} />
      {crearTarjeta.isError && <TextoError>{crearTarjeta.error.message}</TextoError>}
      <Boton onPress={guardar} cargando={crearTarjeta.isPending}>
        Guardar
      </Boton>
    </>
  );
}
