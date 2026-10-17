import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, CreditCard, Plus, Settings } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AtajosDeGasto } from '@/components/AtajosDeGasto';
import { CifraDelDia } from '@/components/CifraDelDia';
import { FormularioGasto } from '@/components/FormularioGasto';
import { FormularioIngreso } from '@/components/FormularioIngreso';
import { PasoDeGuia, Resaltado } from '@/components/PasoDeGuia';
import { ActividadReciente, RecordatorioContextual, ResumenCompactoPeriodo } from '@/components/ResumenInicio';
import { Boton, Cargando, ErrorConReintento, HojaInferior, Pantalla, Tarjeta, TextoError, TextoTenue, Titulo, estilos as ui } from '@/components/ui';
import { useAtajos, type Atajo } from '@/hooks/use-atajos';
import { useCrearPeriodo } from '@/hooks/use-crear-periodo';
import { useDisponible } from '@/hooks/use-disponible';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { useGastos } from '@/hooks/use-gastos';
import { useGuia } from '@/hooks/use-guia';
import { usePagosTarjetaPeriodo } from '@/hooks/use-pagos-tarjeta-periodo';
import { usePeriodoActivo } from '@/hooks/use-periodo-activo';
import { useResumenPendiente } from '@/hooks/use-resumen-pendiente';
import { ApiError } from '@/lib/api';
import { formatearRangoFechas, quincenaDeHoy } from '@/lib/fechas';
import { pasoDeInicio, TEXTOS_GUIA } from '@/lib/guia';
import { colores } from '@/lib/tema';

/**
 * Inicio, igual que frontend/src/routes/Home.tsx: tres estados en orden de arranque —sin quincena, con quincena pero sin
 * ingreso, y con la cifra real—, nunca una mezcla ni un $0 disfrazado. Arriba, los avisos de sobrante sin decidir y de
 * pagos de tarjeta aplicados; abajo, la actividad reciente y el resumen compacto.
 *
 * La guía de primeros pasos (lib/guia.ts) va en línea: cada paso aparece cuando la persona llega a ese punto, pegado al
 * elemento que explica (envuelto en `Resaltado`). Solo para cuentas nuevas o quien la pidió en Más.
 */
export default function Inicio() {
  const formatearMonto = useFormatearMonto();
  const { data, isLoading, error, refetch, isFetching } = useDisponible();
  const { data: periodoActivo } = usePeriodoActivo();
  const { data: resumenPendiente } = useResumenPendiente();
  const crearPeriodo = useCrearPeriodo();
  const quincena = quincenaDeHoy();
  const [mostrarFormularioGasto, setMostrarFormularioGasto] = useState(false);
  const [mostrarFormularioIngreso, setMostrarFormularioIngreso] = useState(false);
  // Un atajo que superó lo disponible abre el formulario con sus datos puestos (ver AtajosDeGasto).
  const [atajoEnFormulario, setAtajoEnFormulario] = useState<Atajo | null>(null);

  const sinPeriodoActivo = error instanceof ApiError && error.codigo === 'PERIODO_NO_ENCONTRADO';
  const errorInesperado = error && !sinPeriodoActivo;
  // Un gasto se puede registrar con o sin ingreso: el único requisito es tener una quincena activa.
  const periodoId = !error ? data?.periodoId : undefined;
  const { data: pagosTarjeta } = usePagosTarjetaPeriodo(periodoId);

  const guia = useGuia();
  const { data: listaAtajos } = useAtajos();
  const { data: paginasGastos } = useGastos(periodoId);
  const hayGastos = paginasGastos?.pages.some((pagina) => pagina.datos.some((g) => !g.revertido && !g.esRecurrente)) ?? false;
  const pasoGuia = guia.activa
    ? pasoDeInicio(guia.vistos, {
        sinPeriodo: sinPeriodoActivo,
        sinIngreso: !error && data?.estado === 'sin_ingreso',
        conCifra: !error && data?.estado === 'ok',
        hayAtajos: (listaAtajos?.atajos.length ?? 0) > 0,
        hayGastos,
      })
    : null;
  const saltarGuia = () => void guia.terminar();

  // `korly:///?gasto=1` abre directo la hoja de "Nuevo gasto" (el enlace del recordatorio; con las notificaciones de la
  // app será el destino al tocarla). Se espera a tener quincena y el parámetro se quita para no reabrirla.
  const { gasto } = useLocalSearchParams<{ gasto?: string }>();
  useEffect(() => {
    if (gasto !== '1' || !periodoId) return;
    setMostrarFormularioGasto(true);
    router.setParams({ gasto: undefined });
  }, [gasto, periodoId]);

  function cerrarFormularioGasto() {
    setMostrarFormularioGasto(false);
    setAtajoEnFormulario(null);
  }

  return (
    <>
      <Pantalla>
        <View style={estilos.encabezado}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Image source={require('../../../../assets/splash-icon.png')} style={{ width: 30, height: 30 }} accessibilityIgnoresInvertColors />
            <Text style={{ fontSize: 17, fontWeight: '700', color: colores.texto }}>Korly</Text>
          </View>
          <Pressable onPress={() => router.navigate('/mas')} accessibilityRole="button" accessibilityLabel="Ajustes" style={ui.botonRedondo} hitSlop={6}>
            <Settings size={17} color={colores.textoTenue} />
          </Pressable>
        </View>

        {periodoActivo && <Text style={estilos.quincena}>Quincena · {formatearRangoFechas(periodoActivo.fechaInicio, periodoActivo.fechaFin)}</Text>}

        {resumenPendiente && (
          // Hallazgo real de la web: sin este aviso, un sobrante sin decidir parecía dinero que había desaparecido.
          <View style={estilos.avisoDorado}>
            <View style={estilos.circuloDorado}>
              <AlertTriangle size={15} color="#5A4300" />
            </View>
            <Text style={{ flex: 1, fontSize: 13, color: colores.texto }}>
              Tienes <Text style={{ fontWeight: '700' }}>{formatearMonto(resumenPendiente.sobrante)}</Text> sin decidir de un periodo anterior.
            </Text>
            <Pressable onPress={() => router.push(`/resumen/${resumenPendiente.periodoId}`)} hitSlop={8}>
              <Text style={{ color: colores.primario, fontWeight: '700', fontSize: 13 }}>Decidir →</Text>
            </Pressable>
          </View>
        )}

        {pagosTarjeta && pagosTarjeta.length > 0 && (
          // Hallazgo real de la web: el pago de tarjeta se descuenta solo, pero sin este aviso el disponible bajaba sin explicación.
          <View style={estilos.avisoPrimario}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CreditCard size={15} color={colores.primario} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: colores.texto }}>
                {pagosTarjeta.length} pago{pagosTarjeta.length === 1 ? '' : 's'} de tarjeta aplicado{pagosTarjeta.length === 1 ? '' : 's'} esta quincena
              </Text>
            </View>
            {pagosTarjeta.map((pago, indice) => (
              <Text key={indice} style={{ fontSize: 12.5, color: colores.textoTenue, paddingLeft: 23 }}>
                {pago.tarjetaNombre} — {pago.cargoDescripcion} ({pago.numeroPago}/{pago.numeroPlazos}): {formatearMonto(pago.monto)}
              </Text>
            ))}
          </View>
        )}

        {isLoading && <Cargando />}

        {errorInesperado && <ErrorConReintento mensaje={error.message} onReintentar={() => void refetch()} reintentando={isFetching} />}

        {sinPeriodoActivo && (
          <Tarjeta>
            <Titulo>Empecemos</Titulo>
            <TextoTenue>
              Korly lleva tu dinero por quincenas del calendario: del 1 al 15 y del 16 al último día del mes. Hoy estás en la quincena del {formatearRangoFechas(quincena.fechaInicio, quincena.fechaFin)}. No
              importa si la quincena ya va a la mitad: puedes empezar hoy con lo que tengas.
            </TextoTenue>
            <Resaltado activo={pasoGuia === 'quincena'} radio={14}>
              <Boton onPress={() => crearPeriodo.mutate()} cargando={crearPeriodo.isPending}>
                Empezar esta quincena
              </Boton>
            </Resaltado>
            {crearPeriodo.isError && <TextoError>{crearPeriodo.error.message}</TextoError>}
          </Tarjeta>
        )}
        {pasoGuia === 'quincena' && <PasoDeGuia texto={TEXTOS_GUIA.quincena.texto} etiquetaPrincipal="Siguiente" onPrincipal={() => guia.marcarVisto('quincena')} onSaltar={saltarGuia} />}

        {!error && data?.estado === 'sin_ingreso' && (
          <Resaltado activo={pasoGuia === 'ingreso'} radio={20}>
            <Tarjeta>
              <Titulo>Registra tu ingreso</Titulo>
              <TextoTenue>Escribe cuánto dinero tienes para esta quincena. Si ya va a la mitad, pon solo lo que te queda hoy: lo repartimos entre los días que faltan.</TextoTenue>
              <FormularioIngreso periodoId={data.periodoId} primerIngreso />
            </Tarjeta>
          </Resaltado>
        )}
        {pasoGuia === 'ingreso' && <PasoDeGuia texto={TEXTOS_GUIA.ingreso.texto} etiquetaPrincipal="Siguiente" onPrincipal={() => guia.marcarVisto('ingreso')} onSaltar={saltarGuia} />}

        {!error && data?.estado === 'ok' && (
          <>
            <Resaltado activo={pasoGuia === 'cifra'} radio={24}>
              <CifraDelDia disponible={data} />
            </Resaltado>
            {pasoGuia === 'cifra' && <PasoDeGuia texto={TEXTOS_GUIA.cifra.texto} etiquetaPrincipal="Siguiente" onPrincipal={() => guia.marcarVisto('cifra')} onSaltar={saltarGuia} />}
            <RecordatorioContextual disponible={data} />
          </>
        )}

        {periodoId && (
          <Resaltado activo={pasoGuia === 'registrar-gasto'} radio={14}>
            <Boton
              onPress={() => {
                // Abrir el formulario por su cuenta equivale a haber leído este paso.
                if (pasoGuia === 'registrar-gasto') guia.marcarVisto('registrar-gasto');
                setMostrarFormularioGasto(true);
              }}
              icono={<Plus size={18} color={colores.primarioTexto} strokeWidth={2.5} />}
            >
              Registrar gasto
            </Boton>
          </Resaltado>
        )}
        {pasoGuia === 'registrar-gasto' && (
          <PasoDeGuia texto={TEXTOS_GUIA['registrar-gasto'].texto} etiquetaPrincipal="Entendido" onPrincipal={() => guia.marcarVisto('registrar-gasto')} onSaltar={saltarGuia} />
        )}

        {periodoId && (
          <Resaltado activo={pasoGuia === 'atajo-inicio'} radio={16}>
            <AtajosDeGasto
              periodoId={periodoId}
              onAbrirFormulario={(atajo) => {
                setAtajoEnFormulario(atajo);
                setMostrarFormularioGasto(true);
              }}
            />
          </Resaltado>
        )}
        {pasoGuia === 'atajo-inicio' && (
          <PasoDeGuia texto={TEXTOS_GUIA['atajo-inicio'].texto} etiquetaPrincipal="Entendido" onPrincipal={() => guia.marcarVisto('atajo-inicio')} onSaltar={saltarGuia} />
        )}
        {pasoGuia === 'recurrentes' && (
          <PasoDeGuia
            titulo={TEXTOS_GUIA.recurrentes.titulo}
            texto={TEXTOS_GUIA.recurrentes.texto}
            etiquetaPrincipal="Ver gastos recurrentes"
            onPrincipal={() => {
              guia.marcarVisto('recurrentes');
              router.push('/recurrentes');
            }}
            etiquetaSecundaria="Ahora no"
            onSecundaria={() => guia.marcarVisto('recurrentes')}
            onSaltar={saltarGuia}
          />
        )}
        {pasoGuia === 'cierre' && <PasoDeGuia titulo={TEXTOS_GUIA.cierre.titulo} texto={TEXTOS_GUIA.cierre.texto} etiquetaPrincipal="Terminar" onPrincipal={saltarGuia} />}

        {periodoId && data?.estado === 'ok' && (
          <Boton variante="contorno" onPress={() => setMostrarFormularioIngreso(true)} icono={<Plus size={17} color={colores.texto} strokeWidth={2.5} />}>
            Registrar ingreso
          </Boton>
        )}

        {periodoId && <ActividadReciente periodoId={periodoId} />}
        {periodoId && data?.estado === 'ok' && <ResumenCompactoPeriodo periodoId={periodoId} />}
      </Pantalla>

      {pasoGuia === 'bienvenida' && (
        // Cerrarla por cualquier lado (X, fuera, atrás) cuenta como "Empezar": saltar toda la guía es una decisión explícita.
        <HojaInferior titulo={TEXTOS_GUIA.bienvenida.titulo} onCerrar={() => guia.marcarVisto('bienvenida')}>
          <Text style={{ fontSize: 14, lineHeight: 20, color: colores.texto }}>{TEXTOS_GUIA.bienvenida.texto}</Text>
          <Boton onPress={() => guia.marcarVisto('bienvenida')}>Empezar</Boton>
          <Boton variante="plano" onPress={saltarGuia}>
            Saltar guía
          </Boton>
        </HojaInferior>
      )}

      {periodoId && mostrarFormularioIngreso && (
        <HojaInferior titulo="Nuevo ingreso" onCerrar={() => setMostrarFormularioIngreso(false)}>
          <FormularioIngreso periodoId={periodoId} onRegistrado={() => setMostrarFormularioIngreso(false)} />
        </HojaInferior>
      )}

      {periodoId && mostrarFormularioGasto && (
        <HojaInferior titulo="Nuevo gasto" onCerrar={cerrarFormularioGasto}>
          <FormularioGasto
            periodoId={periodoId}
            onRegistrado={cerrarFormularioGasto}
            inicial={atajoEnFormulario ? { monto: (atajoEnFormulario.monto.valorMinimo / 100).toFixed(2), categoriaId: atajoEnFormulario.categoriaId, nota: atajoEnFormulario.nombre } : undefined}
          />
        </HojaInferior>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quincena: { fontSize: 13, color: colores.textoTenue, marginTop: -4 },
  avisoDorado: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#F6DE9E', backgroundColor: '#FFF6E1', borderRadius: 16, padding: 12 },
  circuloDorado: { width: 30, height: 30, borderRadius: 15, backgroundColor: colores.dorado, alignItems: 'center', justifyContent: 'center' },
  avisoPrimario: { gap: 6, borderWidth: 1, borderColor: 'rgba(22,127,108,0.3)', backgroundColor: 'rgba(22,127,108,0.05)', borderRadius: 16, padding: 14 },
});
