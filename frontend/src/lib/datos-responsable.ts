/**
 * Datos del responsable del tratamiento que el aviso de privacidad debe
 * nombrar (LFPDPPP) — **un solo lugar** donde llenarlos. `PENDIENTE` hace
 * que `Privacidad.tsx` muestre un banner de borrador: no se debe publicar
 * el aviso con estos campos sin completar.
 */
export const PENDIENTE = 'PENDIENTE';

export const RESPONSABLE = {
  /** Nombre completo de la persona física o razón social de la empresa. */
  nombre: PENDIENTE,
  /** Domicilio para oír y recibir notificaciones. */
  domicilio: PENDIENTE,
  /** Correo al que se dirigen las solicitudes de derechos ARCO. */
  correoArco: 'privacidad@korly.com.mx',
} as const;

/** Versión del texto que acepta el usuario al registrarse — se guarda junto con la fecha como constancia del consentimiento. */
export const VERSION_AVISO_PRIVACIDAD = '2026-10-borrador';

export const hayDatosPendientes = Object.values(RESPONSABLE).some((valor) => valor === PENDIENTE);
