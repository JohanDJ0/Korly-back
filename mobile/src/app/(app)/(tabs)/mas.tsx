import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Bell, ChevronRight, Download, FileText, Lightbulb, LogOut, MessageSquareText, Repeat, ShieldCheck, Tag, Zap, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { CambiarCorreo, CambiarPassword, CerrarPeriodo, EliminarCuenta, FormularioComentarios, TarjetaPlan } from '@/components/Ajustes';
import { Boton, Cargando, Encabezado, HojaInferior, Pantalla, TextoError } from '@/components/ui';
import { useActualizarPreferencias } from '@/hooks/use-actualizar-preferencias';
import { useDescargarDatos } from '@/hooks/use-descargar-datos';
import { useGuia } from '@/hooks/use-guia';
import { usePreferencias } from '@/hooks/use-preferencias';
import { useSuscripcion } from '@/hooks/use-suscripcion';
import { URL_AVISO_PRIVACIDAD, URL_TERMINOS } from '@/lib/aviso';
import { supabase } from '@/lib/supabase';
import { colores } from '@/lib/tema';

/**
 * "Más" = Ajustes de la web (frontend/src/routes/Ajustes.tsx), mismas secciones y en el mismo orden. "Cerrar sesión"
 * vive en Cuenta y "Cerrar periodo" en su propia sección, lejos: en la web un usuario pulsó el segundo creyendo que
 * salía de su cuenta. Nunca deben quedar juntos.
 */
export default function Mas() {
  const { data: preferencias, isLoading, error } = usePreferencias();
  const actualizarPreferencias = useActualizarPreferencias();
  const { data: usuario } = useQuery({ queryKey: ['usuario-actual'], queryFn: async () => (await supabase.auth.getUser()).data.user });
  const { data: suscripcion } = useSuscripcion();
  const descargarDatos = useDescargarDatos();
  const [comentariosAbiertos, setComentariosAbiertos] = useState(false);
  const guia = useGuia();
  const [errorGuia, setErrorGuia] = useState<string | null>(null);

  return (
    <>
      <Pantalla>
        <Encabezado titulo="Ajustes" sinOjito />
        {isLoading && <Cargando />}
        {error && <TextoError>{error.message}</TextoError>}

        {usuario?.email && (
          <Seccion titulo="CUENTA">
            <View style={[estilos.caja, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <View style={estilos.avatar}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#146155' }}>{usuario.email[0]?.toUpperCase()}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '600', color: colores.texto }} numberOfLines={1}>
                {usuario.email}
              </Text>
              <Boton chico variante="contorno" onPress={() => void supabase.auth.signOut()} icono={<LogOut size={14} color={colores.texto} />}>
                Salir
              </Boton>
            </View>
          </Seccion>
        )}

        {suscripcion && (
          <Seccion titulo="PLAN">
            <View style={estilos.caja}>
              <TarjetaPlan suscripcion={suscripcion} />
            </View>
          </Seccion>
        )}

        {preferencias && (
          <Seccion titulo="NOTIFICACIONES">
            <View style={[estilos.caja, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <IconoFila Icono={Bell} dorado />
              <View style={{ flex: 1 }}>
                <Text style={estilos.filaTitulo}>Recordatorios por correo</Text>
                <Text style={estilos.filaDetalle}>Un resumen diario si no has registrado nada.</Text>
              </View>
              <Switch
                value={preferencias.recibirRecordatorios}
                onValueChange={(valor) => actualizarPreferencias.mutate(valor)}
                disabled={actualizarPreferencias.isPending}
                trackColor={{ true: colores.primario }}
                accessibilityLabel="Recordatorios por correo"
              />
            </View>
            {actualizarPreferencias.isError && <TextoError>{actualizarPreferencias.error.message}</TextoError>}
          </Seccion>
        )}

        <Seccion titulo="SEGURIDAD">
          <View style={[estilos.caja, { gap: 10 }]}>
            <CambiarPassword />
            <CambiarCorreo />
          </View>
        </Seccion>

        <Seccion titulo="DATOS">
          <View style={[estilos.caja, { paddingVertical: 4 }]}>
            <FilaEnlace Icono={Tag} texto="Categorías" onPress={() => router.push('/categorias')} />
            <FilaEnlace Icono={Repeat} texto="Gastos recurrentes" onPress={() => router.push('/recurrentes')} separador />
            <FilaEnlace Icono={Zap} texto="Atajos de gasto" onPress={() => router.push('/atajos')} separador />
          </View>
        </Seccion>

        <Seccion titulo="PERIODO">
          <View style={[estilos.caja, { gap: 10 }]}>
            <CerrarPeriodo />
          </View>
        </Seccion>

        <Seccion titulo="AYUDA">
          <View style={[estilos.caja, { paddingVertical: 4 }]}>
            <FilaEnlace
              Icono={Lightbulb}
              texto="Ver la guía otra vez"
              onPress={() => {
                setErrorGuia(null);
                guia
                  .reiniciar()
                  .then(() => router.navigate('/'))
                  .catch(() => setErrorGuia('No pudimos reiniciar la guía. Inténtalo de nuevo.'));
              }}
            />
            {errorGuia && <TextoError>{errorGuia}</TextoError>}
            <FilaEnlace separador Icono={MessageSquareText} texto="Enviar comentarios" detalle="Cuéntanos qué falla o qué te gustaría que hiciera Korly." onPress={() => setComentariosAbiertos(true)} />
          </View>
        </Seccion>

        <Seccion titulo="PRIVACIDAD Y DATOS">
          <View style={[estilos.caja, { gap: 10 }]}>
            <FilaEnlace Icono={ShieldCheck} texto="Aviso de privacidad" onPress={() => void Linking.openURL(URL_AVISO_PRIVACIDAD)} />
            <FilaEnlace Icono={FileText} texto="Términos y condiciones" onPress={() => void Linking.openURL(URL_TERMINOS)} />
            <Boton variante="contorno" onPress={() => descargarDatos.mutate()} cargando={descargarDatos.isPending} icono={<Download size={15} color={colores.texto} />}>
              Descargar mis datos
            </Boton>
            {descargarDatos.isError && <TextoError>{descargarDatos.error.message}</TextoError>}
            <EliminarCuenta />
          </View>
        </Seccion>
      </Pantalla>

      {comentariosAbiertos && (
        <HojaInferior titulo="Enviar comentarios" onCerrar={() => setComentariosAbiertos(false)}>
          <FormularioComentarios onCerrar={() => setComentariosAbiertos(false)} />
        </HojaInferior>
      )}
    </>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={estilos.rotulo}>{titulo}</Text>
      {children}
    </View>
  );
}

function IconoFila({ Icono, dorado }: { Icono: LucideIcon; dorado?: boolean }) {
  return (
    <View style={[estilos.iconoFila, dorado && { backgroundColor: 'rgba(254,184,22,0.15)' }]}>
      <Icono size={17} color="#146155" />
    </View>
  );
}

function FilaEnlace({ Icono, texto, detalle, onPress, separador }: { Icono: LucideIcon; texto: string; detalle?: string; onPress: () => void; separador?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [estilos.filaEnlace, separador && estilos.separador, pressed && { opacity: 0.6 }]}>
      <IconoFila Icono={Icono} />
      <View style={{ flex: 1 }}>
        <Text style={estilos.filaTitulo}>{texto}</Text>
        {detalle && <Text style={estilos.filaDetalle}>{detalle}</Text>}
      </View>
      <ChevronRight size={16} color={colores.textoTenue} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  rotulo: { fontSize: 12.5, fontWeight: '700', color: colores.textoTenue, letterSpacing: 0.4 },
  caja: { borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.tarjeta, borderRadius: 16, padding: 14 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#eaf5f1', alignItems: 'center', justifyContent: 'center' },
  iconoFila: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#eaf5f1', alignItems: 'center', justifyContent: 'center' },
  filaEnlace: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  separador: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colores.borde },
  filaTitulo: { fontSize: 14, fontWeight: '500', color: colores.texto },
  filaDetalle: { fontSize: 12, color: colores.textoTenue },
});
