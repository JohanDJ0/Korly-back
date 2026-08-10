CREATE TABLE "gastos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"periodo_id" uuid NOT NULL,
	"movimiento_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gastos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_periodo_id_periodos_id_fk" FOREIGN KEY ("periodo_id") REFERENCES "public"."periodos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "gastos_aislamiento_tenant" ON "gastos" AS PERMISSIVE FOR ALL TO "app_backend" USING ("gastos"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("gastos"."tenant_id" = current_setting('app.tenant_id', true)::uuid);