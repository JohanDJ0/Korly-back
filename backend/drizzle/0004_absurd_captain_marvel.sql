CREATE TABLE "ingresos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"periodo_id" uuid NOT NULL,
	"movimiento_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingresos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_periodo_id_periodos_id_fk" FOREIGN KEY ("periodo_id") REFERENCES "public"."periodos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "ingresos_aislamiento_tenant" ON "ingresos" AS PERMISSIVE FOR ALL TO "app_backend" USING ("ingresos"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("ingresos"."tenant_id" = current_setting('app.tenant_id', true)::uuid);