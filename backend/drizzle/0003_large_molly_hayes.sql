CREATE TABLE "periodos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "periodos_tipo_valido" CHECK ("periodos"."tipo" in ('quincenal')),
	CONSTRAINT "periodos_estado_valido" CHECK ("periodos"."estado" in ('borrador','activo','cerrado','archivado'))
);
--> statement-breakpoint
ALTER TABLE "periodos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "periodos" ADD CONSTRAINT "periodos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodos" ADD CONSTRAINT "periodos_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "periodos_un_activo_por_tenant" ON "periodos" USING btree ("tenant_id") WHERE estado = 'activo';--> statement-breakpoint
CREATE POLICY "periodos_aislamiento_tenant" ON "periodos" AS PERMISSIVE FOR ALL TO "app_backend" USING ("periodos"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("periodos"."tenant_id" = current_setting('app.tenant_id', true)::uuid);