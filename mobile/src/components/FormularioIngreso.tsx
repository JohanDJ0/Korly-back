import { useState } from 'react';
import { Text, View } from 'react-native';

import { CampoFecha } from '@/components/CampoFecha';
import { Boton, Campo, TextoError } from '@/components/ui';
import { usePeriodoActivo } from '@/hooks/use-periodo-activo';
import { useRegistrarIngreso } from '@/hooks/use-registrar-ingreso';
import { pesosACentavos } from '@/lib/dinero';
import { formatearRangoFechas, hoyISO } from '@/lib/fechas';
import { NOTA_INGRESO_FIN_DE_QUINCENA, quincenaPorTerminar } from '@/lib/fin-de-quincena';

/**
 * Igual que frontend/src/components/FormularioIngreso.tsx. `primerIngreso`: la tarjeta "Registra tu ingreso" pregunta por
 * el dinero que se tiene (quien empieza a mitad de quincena anota lo que le queda hoy), no por el pago.
 */
export function FormularioIngreso({ periodoId, onRegistrado, primerIngreso = false }: { periodoId: string; onRegistrado?: () => void; primerIngreso?: boolean }) {
  const registrarIngreso = useRegistrarIngreso();
  const { data: periodo } = usePeriodoActivo();
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [errorMonto, setErrorMonto] = useState<string | undefined>(undefined);

  function enviar() {
    const centavos = pesosACentavos(monto);
    if (centavos === null) return setErrorMonto('El monto debe ser mayor a cero');
    setErrorMonto(undefined);
    registrarIngreso.mutate({ periodoId, monto: { valorMinimo: centavos, moneda: 'MXN' }, fechaEfectiva: fecha }, { onSuccess: () => onRegistrado?.() });
  }

  return (
    <View style={{ gap: 14 }}>
      <Campo
        etiqueta={primerIngreso ? '¿Cuánto dinero tienes para esta quincena?' : '¿Cuánto recibiste?'}
        value={monto}
        onChangeText={setMonto}
        keyboardType="decimal-pad"
        autoFocus
        error={errorMonto}
      />
      <CampoFecha
        etiqueta="¿Cuándo te pagaron?"
        valor={fecha}
        onCambio={setFecha}
        ayuda={periodo ? `Es solo la fecha en que te llegó el dinero. Tu quincena es del ${formatearRangoFechas(periodo.fechaInicio, periodo.fechaFin)} y no cambia por esta fecha.` : undefined}
      />
      {periodo && quincenaPorTerminar(periodo.fechaFin, hoyISO()) && (
        // En los últimos días: un pago adelantado de la quincena siguiente registrado hoy inflaría la cifra de estos días.
        <Text style={{ backgroundColor: '#eaf5f1', color: '#146155', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12.5, lineHeight: 18 }}>{NOTA_INGRESO_FIN_DE_QUINCENA}</Text>
      )}
      {registrarIngreso.isError && <TextoError>{registrarIngreso.error.message}</TextoError>}
      <Boton onPress={enviar} cargando={registrarIngreso.isPending}>
        Registrar ingreso
      </Boton>
    </View>
  );
}
