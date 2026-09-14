CREATE TABLE "metas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"monto_objetivo_valor_minimo" bigint NOT NULL,
	"moneda" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metas_monto_objetivo_positivo" CHECK ("metas"."monto_objetivo_valor_minimo" > 0)
);
--> statement-breakpoint
ALTER TABLE "metas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "arrastres" ADD COLUMN "meta_destino_id" uuid;--> statement-breakpoint
ALTER TABLE "metas" ADD CONSTRAINT "metas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metas" ADD CONSTRAINT "metas_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrastres" ADD CONSTRAINT "arrastres_meta_destino_id_metas_id_fk" FOREIGN KEY ("meta_destino_id") REFERENCES "public"."metas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrastres" ADD CONSTRAINT "arrastres_un_solo_destino" CHECK ("arrastres"."periodo_destino_id" is null or "arrastres"."meta_destino_id" is null);--> statement-breakpoint
CREATE POLICY "metas_aislamiento_tenant" ON "metas" AS PERMISSIVE FOR ALL TO "app_backend" USING ("metas"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("metas"."tenant_id" = current_setting('app.tenant_id', true)::uuid);