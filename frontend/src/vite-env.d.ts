/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_BASE_URL: string;
  /** Opcional — ver src/lib/observabilidad.ts. */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  /** Opcionales — datos del responsable de los avisos legales; ver src/lib/datos-responsable.ts. */
  readonly VITE_RESPONSABLE_NOMBRE?: string;
  readonly VITE_RESPONSABLE_DOMICILIO?: string;
  readonly VITE_RESPONSABLE_JURISDICCION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
