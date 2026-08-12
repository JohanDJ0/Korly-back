CREATE TABLE "arrastres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resumen_id" uuid NOT NULL,
	"periodo_origen_id" uuid NOT NULL,
	"monto_valor_minimo" bigint NOT NULL,
	"moneda" text NOT NULL,
	"movimiento_entrada_id" uuid NOT NULL,
	"periodo_destino_id" uuid,
	"movimiento_salida_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arrastres_resumen_unico" UNIQUE("resumen_id")
);
--> statement-breakpoint
ALTER TABLE "arrastres" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cuentas" DROP CONSTRAINT "cuentas_tipo_valido";--> statement-breakpoint
ALTER TABLE "arrastres" ADD CONSTRAINT "arrastres_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrastres" ADD CONSTRAINT "arrastres_resumen_id_resumenes_id_fk" FOREIGN KEY ("resumen_id") REFERENCES "public"."resumenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrastres" ADD CONSTRAINT "arrastres_periodo_origen_id_periodos_id_fk" FOREIGN KEY ("periodo_origen_id") REFERENCES "public"."periodos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrastres" ADD CONSTRAINT "arrastres_movimiento_entrada_id_movimientos_id_fk" FOREIGN KEY ("movimiento_entrada_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrastres" ADD CONSTRAINT "arrastres_periodo_destino_id_periodos_id_fk" FOREIGN KEY ("periodo_destino_id") REFERENCES "public"."periodos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrastres" ADD CONSTRAINT "arrastres_movimiento_salida_id_movimientos_id_fk" FOREIGN KEY ("movimiento_salida_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cuentas_una_arrastre_pendiente_por_tenant" ON "cuentas" USING btree ("tenant_id") WHERE tipo = 'arrastre_pendiente';--> statement-breakpoint
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_tipo_valido" CHECK ("cuentas"."tipo" in ('periodo','meta','efectivo','banco','tarjeta','arrastre_pendiente'));--> statement-breakpoint
CREATE POLICY "arrastres_aislamiento_tenant" ON "arrastres" AS PERMISSIVE FOR ALL TO "app_backend" USING ("arrastres"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("arrastres"."tenant_id" = current_setting('app.tenant_id', true)::uuid);