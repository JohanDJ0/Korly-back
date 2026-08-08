import { pgRole } from 'drizzle-orm/pg-core';

/**
 * Rol de conexión en tiempo de ejecución del backend (ADR-005).
 *
 * Se crea a mano una sola vez por entorno vía scripts/bootstrap-roles.sql,
 * nunca aquí: requiere una contraseña que no debe vivir en código versionado.
 * `.existing()` le dice a drizzle-kit que solo lo referencie al generar
 * políticas RLS, sin intentar crearlo, alterarlo ni eliminarlo.
 *
 * Es un rol sin privilegios especiales (NOBYPASSRLS) a propósito: el rol
 * "postgres" de Supabase que usan las migraciones sí puede saltarse RLS,
 * así que el servidor jamás debe conectarse con él para servir requests.
 */
export const appBackend = pgRole('app_backend').existing();
