// Copia de `hoyISO` de frontend/src/lib/fechas.ts. Fase 3: pasa a un paquete compartido entre la web y la app.

/** Fecha local del teléfono, no UTC — evita que "hoy" salte al día siguiente desde las 6 pm hora de México. */
export function hoyISO(): string {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}
