CREATE TABLE "eventos_webhook_stripe" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"procesado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eventos_webhook_stripe" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "estado_suscripcion" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "suscripcion_vigente_hasta" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_stripe_customer_id_unico" UNIQUE("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_estado_suscripcion_valido" CHECK ("tenants"."estado_suscripcion" is null or "tenants"."estado_suscripcion" in ('trialing', 'activa', 'pago_pendiente', 'cancelada'));