import { router, usePathname } from 'expo-router';
import { Bell, Check, Crown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { MENSAJE_CAPTCHA_PENDIENTE, useCaptcha } from '@/components/CaptchaTurnstile';
import { Boton, Campo, estilos as ui, HojaInferior, Segmentado, TextoError, TextoTenue } from '@/components/ui';
import { useAvisoPro } from '@/hooks/use-aviso-pro';
import { useCerrarPeriodo } from '@/hooks/use-cerrar-periodo';
import { useEliminarCuenta } from '@/hooks/use-eliminar-cuenta';
import { useEnviarComentario, type TipoDeComentario } from '@/hooks/use-enviar-comentario';
import { usePeriodoActivo } from '@/hooks/use-periodo-activo';
import { useSesion } from '@/hooks/use-sesion';
import type { Suscripcion } from '@/hooks/use-suscripcion';
import { mensajeDeErrorAuth } from '@/lib/errores-auth';
import { formatearFecha, formatearRangoFechas } from '@/lib/fechas';
import { supabase } from '@/lib/supabase';
import { colores } from '@/lib/tema';

// Las piezas de Ajustes, iguales a las de la web (TarjetaPlan, CambiarPassword, CambiarCorreo, CerrarPeriodo,
// EliminarCuenta y FormularioComentarios), con los mismos textos.

const LONGITUD_MINIMA_PASSWORD = 8;

/** Qué incluirá Korly Pro (docs/plan-pro.md). Igual que en la web. */
const GRUPOS_PRO = [
  {
    titulo: 'PARA COMPARTIR',
    ventajas: [
      { nombre: 'Presupuesto en pareja o familia', detalle: 'dos personas llevan juntas la misma quincena: las dos registran gastos y ven cuánto les queda.' },
      { nombre: 'Metas en común', detalle: 'cada quien aporta desde su cuenta a la misma meta —el viaje, el enganche, el fondo de emergencia— y las dos ven cómo avanza.' },
    ],
  },
  {
    titulo: 'PARA IR MÁS LEJOS',
    ventajas: [
      { nombre: 'Alertas de ritmo', detalle: 'te avisa a tiempo si vas gastando más rápido de lo que alcanza tu quincena.' },
      { nombre: 'Metas sin límite', detalle: 'el plan gratuito incluye 2.' },
      { nombre: 'Más atajos de gasto', detalle: 'el plan gratuito incluye 3 para registrar con un toque; Pro, hasta 12.' },
      { nombre: 'Historial completo', detalle: 'todas tus quincenas, no solo los últimos 12 meses.' },
      { nombre: 'Exportar a CSV', detalle: 'tus gastos e ingresos para tu contador o tu hoja de cálculo.' },
    ],
  },
] as const;

/**
 * El plan. **En la app no se vende Pro** (ni botones de pago ni enlaces para pagar): Google Play exige su propio sistema
 * de cobro para suscripciones digitales dentro de la app. Mientras Pro no exista se muestra qué traerá y "Avísame",
 * igual que la web; con Pro activo, solo su estado.
 */
export function TarjetaPlan({ suscripcion }: { suscripcion: Suscripcion }) {
  const { pedir, cancelar } = useAvisoPro();
  const esPro = suscripcion.plan === 'pro';
  const proProximamente = !esPro && !suscripcion.cobrosHabilitados;
  const pidioAviso = suscripcion.avisoProSolicitadoEn !== null;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[ui.botonRedondo, { borderWidth: 0, backgroundColor: 'rgba(254,184,22,0.15)', borderRadius: 11 }]}>
          <Crown size={17} color="#146155" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colores.texto }}>{esPro ? 'Korly Pro' : 'Plan gratuito'}</Text>
          <Text style={ui.tenueChico}>
            {suscripcion.estadoSuscripcion === 'trialing' && suscripcion.suscripcionVigenteHasta && `Prueba gratis hasta el ${formatearFecha(suscripcion.suscripcionVigenteHasta)}`}
            {suscripcion.estadoSuscripcion === 'activa' && suscripcion.suscripcionVigenteHasta && `Vigente hasta el ${formatearFecha(suscripcion.suscripcionVigenteHasta)}`}
            {suscripcion.estadoSuscripcion === 'pago_pendiente' && 'Hubo un problema con tu último cobro'}
            {suscripcion.estadoSuscripcion === 'cancelada' && 'Tu suscripción terminó'}
            {suscripcion.plan === 'free' && !suscripcion.estadoSuscripcion && 'Categorías, metas y recordatorios básicos, sin costo'}
          </Text>
        </View>
      </View>
      {proProximamente && (
        <View style={{ backgroundColor: 'rgba(234,245,241,0.6)', borderRadius: 12, padding: 12, gap: 12 }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colores.texto }}>Korly Pro llegará pronto</Text>
            <Text style={ui.tenueChico}>Para cuando el dinero ya no es solo tuyo, o quieres ir más lejos con tus quincenas.</Text>
          </View>
          {GRUPOS_PRO.map((grupo) => (
            <View key={grupo.titulo} style={{ gap: 6 }}>
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: colores.textoTenue, letterSpacing: 0.4 }}>{grupo.titulo}</Text>
              {grupo.ventajas.map((ventaja) => (
                <View key={ventaja.nombre} style={{ flexDirection: 'row', gap: 8 }}>
                  <Check size={14} color={colores.texto} style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, fontSize: 12.5, color: colores.texto }}>
                    <Text style={{ fontWeight: '600' }}>{ventaja.nombre}</Text>
                    <Text style={{ color: colores.textoTenue }}> — {ventaja.detalle}</Text>
                  </Text>
                </View>
              ))}
            </View>
          ))}
          {pidioAviso ? (
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: colores.texto }}>Listo, te avisaremos por correo cuando esté disponible.</Text>
              <Boton chico variante="plano" onPress={() => cancelar.mutate()} cargando={cancelar.isPending} style={{ alignSelf: 'flex-start' }}>
                Ya no me avises
              </Boton>
            </View>
          ) : (
            <Boton chico onPress={() => pedir.mutate()} cargando={pedir.isPending} icono={<Bell size={15} color={colores.primarioTexto} />}>
              Avísame cuando esté disponible
            </Boton>
          )}
          {(pedir.isError || cancelar.isError) && <TextoError>{(pedir.error ?? cancelar.error)?.message ?? ''}</TextoError>}
        </View>
      )}
    </View>
  );
}

/**
 * Cambiar la contraseña estando dentro: pide la actual y la comprueba antes (quien encuentre la sesión abierta no se queda
 * con la cuenta). Comprobarla es iniciar sesión otra vez, así que con el captcha encendido también lo pide.
 */
export function CambiarPassword() {
  const { session } = useSesion();
  const correo = session?.user.email;
  const [abierto, setAbierto] = useState(false);
  const [listo, setListo] = useState(false);

  return (
    <>
      <Boton variante="contorno" onPress={() => (setListo(false), setAbierto(true))}>
        Cambiar contraseña
      </Boton>
      {listo && <Text style={ui.tenue}>Listo — tu contraseña se actualizó.</Text>}
      {abierto && (
        <HojaInferior titulo="Cambiar contraseña" onCerrar={() => setAbierto(false)}>
          <FormularioCambiarPassword correo={correo} onListo={() => (setAbierto(false), setListo(true))} />
        </HojaInferior>
      )}
    </>
  );
}

function FormularioCambiarPassword({ correo, onListo }: { correo: string | undefined; onListo: () => void }) {
  const captcha = useCaptcha();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar() {
    setError(null);
    if (!actual) return setError('Escribe tu contraseña actual');
    if (nueva.length < LONGITUD_MINIMA_PASSWORD) return setError(`La contraseña necesita al menos ${LONGITUD_MINIMA_PASSWORD} caracteres`);
    if (!confirmacion) return setError('Confirma tu contraseña nueva');
    if (nueva !== confirmacion) return setError('Las contraseñas no coinciden');
    if (!correo) return setError('No se pudo identificar tu cuenta. Vuelve a iniciar sesión.');
    if (captcha.activo && !captcha.token) return setError(MENSAJE_CAPTCHA_PENDIENTE);
    setEnviando(true);
    const verificacion = await supabase.auth.signInWithPassword({ email: correo, password: actual, options: { captchaToken: captcha.token } });
    captcha.reiniciar(); // el token es de un solo uso
    if (verificacion.error) {
      setEnviando(false);
      return setError(mensajeDeErrorAuth(verificacion.error, 'reautenticar'));
    }
    const { error: errorAlCambiar } = await supabase.auth.updateUser({ password: nueva });
    setEnviando(false);
    if (errorAlCambiar) return setError(mensajeDeErrorAuth(errorAlCambiar));
    onListo();
  }

  return (
    <>
      <Campo etiqueta="Contraseña actual" value={actual} onChangeText={setActual} secureTextEntry autoComplete="current-password" autoFocus />
      <Campo etiqueta="Contraseña nueva" value={nueva} onChangeText={setNueva} secureTextEntry autoComplete="new-password" />
      <Campo etiqueta="Confirma la contraseña nueva" value={confirmacion} onChangeText={setConfirmacion} secureTextEntry autoComplete="new-password" />
      {captcha.elemento}
      {error && <TextoError>{error}</TextoError>}
      <Boton onPress={() => void guardar()} cargando={enviando}>
        Guardar contraseña
      </Boton>
    </>
  );
}

/**
 * Cambiar el correo: pide la contraseña y NO cambia nada al instante. Supabase manda un enlace de confirmación (al correo
 * actual y al nuevo) y solo entonces cambia. Los datos y el plan se quedan donde están.
 */
export function CambiarCorreo() {
  const { session } = useSesion();
  const correoActual = session?.user.email;
  const [abierto, setAbierto] = useState(false);
  const [enviadoA, setEnviadoA] = useState<string | null>(null);

  return (
    <>
      <Boton variante="contorno" onPress={() => (setEnviadoA(null), setAbierto(true))}>
        Cambiar correo
      </Boton>
      {enviadoA && <Text style={ui.tenue}>Te enviamos un enlace de confirmación a tu correo actual y a {enviadoA}. El cambio se aplica cuando confirmes.</Text>}
      {abierto && (
        <HojaInferior titulo="Cambiar correo" onCerrar={() => setAbierto(false)}>
          <FormularioCambiarCorreo correoActual={correoActual} onEnviado={(destino) => (setAbierto(false), setEnviadoA(destino))} />
        </HojaInferior>
      )}
    </>
  );
}

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FormularioCambiarCorreo({ correoActual, onEnviado }: { correoActual: string | undefined; onEnviado: (destino: string) => void }) {
  const captcha = useCaptcha();
  const [nuevoCorreo, setNuevoCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setError(null);
    const destino = nuevoCorreo.trim();
    if (!CORREO_VALIDO.test(destino)) return setError('Correo inválido');
    if (!password) return setError('Escribe tu contraseña');
    if (!correoActual) return setError('No se pudo identificar tu cuenta. Vuelve a iniciar sesión.');
    if (destino.toLowerCase() === correoActual.toLowerCase()) return setError('Ese ya es el correo de tu cuenta');
    if (captcha.activo && !captcha.token) return setError(MENSAJE_CAPTCHA_PENDIENTE);
    setEnviando(true);
    const verificacion = await supabase.auth.signInWithPassword({ email: correoActual, password, options: { captchaToken: captcha.token } });
    captcha.reiniciar();
    if (verificacion.error) {
      setEnviando(false);
      return setError(mensajeDeErrorAuth(verificacion.error, 'reautenticar'));
    }
    // El enlace del correo abre la web (la app todavía no recibe enlaces).
    const { error: errorAlCambiar } = await supabase.auth.updateUser({ email: destino }, { emailRedirectTo: 'https://app.korly.com.mx' });
    setEnviando(false);
    if (errorAlCambiar) return setError(mensajeDeErrorAuth(errorAlCambiar));
    onEnviado(destino);
  }

  return (
    <>
      <Campo etiqueta="Correo nuevo" value={nuevoCorreo} onChangeText={setNuevoCorreo} keyboardType="email-address" autoCapitalize="none" autoComplete="email" autoFocus />
      <Campo etiqueta="Tu contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      {captcha.elemento}
      {error && <TextoError>{error}</TextoError>}
      <Boton onPress={() => void enviar()} cargando={enviando}>
        Enviar enlace de confirmación
      </Boton>
    </>
  );
}

const PALABRA_CERRAR = 'CERRAR';

/**
 * Cierre manual con la fricción que merece (en la web un usuario real lo pulsó creyendo que salía de su cuenta): hay que
 * escribir la palabra. Es reversible desde el resumen mientras no se decida el sobrante.
 */
export function CerrarPeriodo() {
  const { data: periodo } = usePeriodoActivo();
  const cerrarPeriodo = useCerrarPeriodo();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');

  function cerrarHoja() {
    setAbierto(false);
    setTexto('');
    cerrarPeriodo.reset();
  }

  if (!periodo) return <TextoTenue>No tienes un periodo abierto en este momento.</TextoTenue>;
  const confirmado = texto.trim().toUpperCase() === PALABRA_CERRAR;

  return (
    <>
      <Text style={ui.tenue}>
        Tu periodo actual es del <Text style={{ fontWeight: '700', color: colores.texto }}>{formatearRangoFechas(periodo.fechaInicio, periodo.fechaFin)}</Text>. Se cierra solo al terminar la quincena; ciérralo
        antes solo si de verdad quieres cortarlo aquí.
      </Text>
      <Boton variante="contorno" onPress={() => setAbierto(true)}>
        Cerrar este periodo…
      </Boton>
      {abierto && (
        <HojaInferior titulo="Cerrar periodo" onCerrar={cerrarHoja}>
          <View style={{ backgroundColor: '#eaf5f1', borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 13, color: '#146155' }}>
              ¿Querías salir de tu cuenta? Eso es <Text style={{ fontWeight: '700' }}>Cerrar sesión</Text>, arriba en esta misma pantalla, en Cuenta.
            </Text>
          </View>
          {[
            'Se genera el resumen del periodo y ya no podrás registrar gastos ni ingresos en él.',
            'El sobrante queda por decidir: guardarlo en una meta o pasarlo al periodo siguiente.',
            'Si fue un error, podrás reabrirlo desde su resumen mientras no hayas decidido el sobrante.',
          ].map((punto) => (
            <Text key={punto} style={{ fontSize: 13, color: colores.texto }}>
              • {punto}
            </Text>
          ))}
          <Campo etiqueta={`Para confirmar, escribe ${PALABRA_CERRAR}`} value={texto} onChangeText={setTexto} autoCapitalize="characters" autoComplete="off" />
          {cerrarPeriodo.isError && <TextoError>{cerrarPeriodo.error.message}</TextoError>}
          <Boton
            variante="peligro"
            deshabilitado={!confirmado}
            cargando={cerrarPeriodo.isPending}
            onPress={() =>
              cerrarPeriodo.mutate(periodo.id, {
                onSuccess: (resumen) => {
                  cerrarHoja();
                  router.push(`/resumen/${resumen.periodoId}`);
                },
              })
            }
          >
            Cerrar periodo
          </Boton>
        </HojaInferior>
      )}
    </>
  );
}

const PALABRA_ELIMINAR = 'ELIMINAR';

/** Irreversible: hay que escribir la palabra (el backend la vuelve a exigir). Al terminar, la sesión se cierra sola. */
export function EliminarCuenta() {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const eliminarCuenta = useEliminarCuenta();

  if (!abierto) {
    return (
      <Pressable onPress={() => setAbierto(true)} style={[ui.boton, { borderWidth: 1, borderColor: 'rgba(220,38,38,0.25)' }]}>
        <Text style={{ color: colores.peligro, fontWeight: '700', fontSize: 15 }}>Eliminar mi cuenta</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ borderWidth: 1, borderColor: 'rgba(220,38,38,0.3)', borderRadius: 12, padding: 14, gap: 12 }}>
      <Text style={{ fontSize: 13, color: colores.texto, lineHeight: 19 }}>
        Se borrarán <Text style={{ fontWeight: '700' }}>todos tus datos</Text> —ingresos, gastos, metas, tarjetas, historial— y se cancelará tu suscripción si tienes una. Esto{' '}
        <Text style={{ fontWeight: '700' }}>no se puede deshacer</Text>. Si quieres conservar algo, descarga tus datos antes.
      </Text>
      <Campo etiqueta={`Para confirmar, escribe ${PALABRA_ELIMINAR}`} value={texto} onChangeText={setTexto} autoCapitalize="characters" autoComplete="off" />
      {eliminarCuenta.isError && <TextoError>{eliminarCuenta.error.message}</TextoError>}
      <Boton variante="peligro" deshabilitado={texto !== PALABRA_ELIMINAR} cargando={eliminarCuenta.isPending} onPress={() => eliminarCuenta.mutate(texto)}>
        Eliminar para siempre
      </Boton>
      <Boton variante="plano" deshabilitado={eliminarCuenta.isPending} onPress={() => (setAbierto(false), setTexto(''))}>
        Cancelar
      </Boton>
    </View>
  );
}

const LONGITUD_MAXIMA_COMENTARIO = 2000;
const TIPOS: { valor: TipoDeComentario; etiqueta: string }[] = [
  { valor: 'problema', etiqueta: 'Algo falla' },
  { valor: 'idea', etiqueta: 'Tengo una idea' },
  { valor: 'otro', etiqueta: 'Otra cosa' },
];
const AYUDA: Record<TipoDeComentario, string> = {
  problema: 'Cuéntanos qué hiciste y qué pasó. Si algo no cuadra, dinos cuánto esperabas ver.',
  idea: 'Dinos qué te gustaría poder hacer y para qué lo usarías.',
  otro: 'Lo que quieras decirnos.',
};

/**
 * Comentarios al equipo (POST /comentarios → correo a soporte), igual que la web: la pantalla donde estabas y un
 * identificador de la cuenta; el correo solo si marcas la casilla; nunca montos. La pantalla va con el prefijo
 * `/android` para saber que vino de la app.
 */
export function FormularioComentarios({ onCerrar }: { onCerrar: () => void }) {
  const pathname = usePathname();
  const enviar = useEnviarComentario();
  const [tipo, setTipo] = useState<TipoDeComentario>('problema');
  const [mensaje, setMensaje] = useState('');
  const [responder, setResponder] = useState(false);
  const [vacio, setVacio] = useState(false);

  if (enviar.isSuccess) {
    return (
      <>
        <Text style={{ backgroundColor: '#eaf5f1', color: '#146155', borderRadius: 12, padding: 14, fontSize: 14 }}>
          ¡Gracias! Tu comentario ya llegó al equipo de Korly. {responder ? 'Si hace falta, te escribiremos a tu correo.' : 'Los leemos todos.'}
        </Text>
        <Boton onPress={onCerrar}>Cerrar</Boton>
      </>
    );
  }

  function alEnviar() {
    if (mensaje.trim().length === 0) return setVacio(true);
    enviar.mutate({ tipo, mensaje: mensaje.trim(), pantalla: `/android${pathname === '/' ? '' : pathname}`.slice(0, 99), responder });
  }

  return (
    <>
      <Segmentado etiqueta="Tipo de comentario" valor={tipo} opciones={TIPOS} onCambiar={setTipo} />
      <View style={{ gap: 6 }}>
        <Text style={ui.etiqueta}>Tu comentario</Text>
        <TextInput
          value={mensaje}
          onChangeText={(t) => (setMensaje(t), vacio && setVacio(false))}
          maxLength={LONGITUD_MAXIMA_COMENTARIO}
          multiline
          numberOfLines={5}
          autoFocus
          placeholder={AYUDA[tipo]}
          placeholderTextColor={colores.textoTenue}
          style={[ui.input, { minHeight: 110, textAlignVertical: 'top' }]}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={ui.tenueChico}>No escribas contraseñas ni datos de tus tarjetas.</Text>
          <Text style={ui.tenueChico}>
            {mensaje.length}/{LONGITUD_MAXIMA_COMENTARIO}
          </Text>
        </View>
        {vacio && <TextoError>Escribe tu comentario</TextoError>}
      </View>
      <Pressable onPress={() => setResponder((v) => !v)} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }} accessibilityRole="checkbox" accessibilityState={{ checked: responder }}>
        <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colores.primario, backgroundColor: responder ? colores.primario : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {responder && <Check size={14} color="#fff" strokeWidth={3} />}
        </View>
        <Text style={{ flex: 1, fontSize: 13, color: colores.texto }}>Pueden escribirme a mi correo si necesitan preguntarme algo.</Text>
      </Pressable>
      <Text style={ui.tenueChico}>Llega al equipo con la pantalla donde estabas y un identificador de tu cuenta, nunca con tus montos. Tu correo solo si marcas la casilla.</Text>
      {enviar.isError && <TextoError>{enviar.error.message}</TextoError>}
      <Boton onPress={alEnviar} cargando={enviar.isPending}>
        Enviar
      </Boton>
    </>
  );
}
