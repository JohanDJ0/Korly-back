CREATE TABLE "recordatorios_enviados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"tipo" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recordatorios_enviados_tipo_valido" CHECK ("recordatorios_enviados"."tipo" in ('diario'))
);
--> statement-breakpoint
ALTER TABLE "recordatorios_enviados" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "recibir_recordatorios" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "recordatorios_enviados" ADD CONSTRAINT "recordatorios_enviados_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recordatorios_enviados_unico_por_dia" ON "recordatorios_enviados" USING btree ("tenant_id","fecha","tipo");--> statement-breakpoint
CREATE POLICY "tenants_actualizacion_propia" ON "tenants" AS PERMISSIVE FOR UPDATE TO "app_backend" USING ("tenants"."id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("tenants"."id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "recordatorios_enviados_aislamiento_tenant" ON "recordatorios_enviados" AS PERMISSIVE FOR ALL TO "app_backend" USING ("recordatorios_enviados"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("recordatorios_enviados"."tenant_id" = current_setting('app.tenant_id', true)::uuid);