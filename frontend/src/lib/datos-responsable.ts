/**
 * Datos del responsable del tratamiento que el aviso de privacidad (LFPDPPP)
 * y los términos y condiciones deben nombrar — **un solo lugar** donde
 * llenarlos. `PENDIENTE` hace que `Privacidad.tsx` y `Terminos.tsx` muestren un
 * aviso de datos pendientes: no se deben publicar con estos campos sin completar.
 */
export const PENDIENTE = 'PENDIENTE';

/**
 * Nombre, domicilio y jurisdicción NO están escritos en el código: el repositorio es público (y su historial de git
 * no se puede limpiar), así que son variables de entorno de la compilación (`VITE_RESPONSABLE_*`, ver `.env.example`;
 * en producción, Vercel). Así se pueden cambiar —por ejemplo el día que exista la empresa— sin tocar el código ni
 * dejar el dato viejo en el historial. Sin la variable, el campo queda en PENDIENTE y las páginas legales muestran un aviso de datos pendientes.
 */
export function valorDeEntorno(valor: string | undefined): string {
  const limpio = valor?.trim();
  return limpio ? limpio : PENDIENTE;
}

export const RESPONSABLE = {
  /** Nombre completo de la persona física (o razón social, el día que exista la empresa). `VITE_RESPONSABLE_NOMBRE`. */
  nombre: valorDeEntorno(import.meta.env.VITE_RESPONSABLE_NOMBRE),
  /**
   * Domicilio para oír y recibir notificaciones. No tiene que ser el de la casa:
   * el Código Civil Federal (art. 34) permite designar un domicilio convencional
   * para el cumplimiento de determinadas obligaciones. Pendiente confirmar con un abogado.
   * `VITE_RESPONSABLE_DOMICILIO`.
   */
  domicilio: valorDeEntorno(import.meta.env.VITE_RESPONSABLE_DOMICILIO),
  /** Correo al que se dirigen las solicitudes de derechos ARCO. */
  correoArco: 'privacidad@korly.com.mx',
  /** Correo de soporte y contacto general. */
  correoSoporte: 'soporte@korly.com.mx',
  /** Ciudad y estado cuyos tribunales resuelven los conflictos (cláusula de jurisdicción de los términos). `VITE_RESPONSABLE_JURISDICCION`. */
  jurisdiccion: valorDeEntorno(import.meta.env.VITE_RESPONSABLE_JURISDICCION),
} as const;

/**
 * Versiones de los dos documentos que acepta el usuario al registrarse — se guardan junto con la fecha como constancia
 * del consentimiento. **Cambiar cualquiera obliga a todos a aceptar de nuevo**: `ProtectedRoute` compara estas versiones
 * con las que cada cuenta aceptó y, si no coinciden, muestra `ReaceptarAviso` antes de dejarla entrar. Súbelas cada vez
 * que cambie algo que afecte qué datos se tratan, para qué o con quién (la ley nueva exige consentimiento cuando
 * cambian las finalidades), o las condiciones de uso.
 */
export const VERSION_AVISO_PRIVACIDAD = '2026-10-08';
export const VERSION_TERMINOS = '2026-10-06';

/** Metadatos del usuario de Supabase donde queda la constancia (los escribe Registro y ReaceptarAviso). */
export function constanciaDeAviso() {
  return {
    aviso_privacidad_version: VERSION_AVISO_PRIVACIDAD,
    terminos_version: VERSION_TERMINOS,
    aviso_privacidad_aceptado_en: new Date().toISOString(),
  };
}

/** ¿Esta cuenta ya aceptó las versiones vigentes del aviso y de los términos? Sin constancia (cuentas anteriores a la casilla) cuenta como no. */
export function aceptoAvisoVigente(metadatos: Record<string, unknown> | undefined): boolean {
  return metadatos?.aviso_privacidad_version === VERSION_AVISO_PRIVACIDAD && metadatos?.terminos_version === VERSION_TERMINOS;
}

export const hayDatosPendientes = Object.values(RESPONSABLE).some((valor) => valor === PENDIENTE);
