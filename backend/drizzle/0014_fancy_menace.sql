CREATE TABLE "tarjetas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"limite_credito_valor_minimo" bigint NOT NULL,
	"moneda" text NOT NULL,
	"dia_corte" smallint NOT NULL,
	"dias_para_pago" smallint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tarjetas_limite_credito_positivo" CHECK ("tarjetas"."limite_credito_valor_minimo" > 0),
	CONSTRAINT "tarjetas_dia_corte_valido" CHECK ("tarjetas"."dia_corte" BETWEEN 1 AND 31),
	CONSTRAINT "tarjetas_dias_para_pago_positivo" CHECK ("tarjetas"."dias_para_pago" > 0)
);
--> statement-breakpoint
ALTER TABLE "tarjetas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cargos_tarjeta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tarjeta_id" uuid NOT NULL,
	"movimiento_id" uuid NOT NULL,
	"descripcion" text NOT NULL,
	"monto_total_valor_minimo" bigint NOT NULL,
	"moneda" text NOT NULL,
	"numero_plazos" smallint NOT NULL,
	"categoria_id" uuid,
	"fecha_compra" date NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cargos_tarjeta_monto_positivo" CHECK ("cargos_tarjeta"."monto_total_valor_minimo" > 0),
	CONSTRAINT "cargos_tarjeta_plazos_validos" CHECK ("cargos_tarjeta"."numero_plazos" >= 1)
);
--> statement-breakpoint
ALTER TABLE "cargos_tarjeta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pagos_tarjeta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cargo_tarjeta_id" uuid NOT NULL,
	"numero_pago" smallint NOT NULL,
	"monto_valor_minimo" bigint NOT NULL,
	"fecha_vencimiento" date NOT NULL,
	"periodo_id" uuid,
	"movimiento_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pagos_tarjeta_monto_positivo" CHECK ("pagos_tarjeta"."monto_valor_minimo" > 0),
	CONSTRAINT "pagos_tarjeta_numero_positivo" CHECK ("pagos_tarjeta"."numero_pago" >= 1)
);
--> statement-breakpoint
ALTER TABLE "pagos_tarjeta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "movimientos" DROP CONSTRAINT "movimientos_tipo_valido";--> statement-breakpoint
ALTER TABLE "tarjetas" ADD CONSTRAINT "tarjetas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarjetas" ADD CONSTRAINT "tarjetas_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos_tarjeta" ADD CONSTRAINT "cargos_tarjeta_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos_tarjeta" ADD CONSTRAINT "cargos_tarjeta_tarjeta_id_tarjetas_id_fk" FOREIGN KEY ("tarjeta_id") REFERENCES "public"."tarjetas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos_tarjeta" ADD CONSTRAINT "cargos_tarjeta_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos_tarjeta" ADD CONSTRAINT "cargos_tarjeta_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_tarjeta" ADD CONSTRAINT "pagos_tarjeta_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_tarjeta" ADD CONSTRAINT "pagos_tarjeta_cargo_tarjeta_id_cargos_tarjeta_id_fk" FOREIGN KEY ("cargo_tarjeta_id") REFERENCES "public"."cargos_tarjeta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_tarjeta" ADD CONSTRAINT "pagos_tarjeta_periodo_id_periodos_id_fk" FOREIGN KEY ("periodo_id") REFERENCES "public"."periodos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_tarjeta" ADD CONSTRAINT "pagos_tarjeta_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pagos_tarjeta_numero_unico_por_cargo" ON "pagos_tarjeta" USING btree ("cargo_tarjeta_id","numero_pago");--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_tipo_valido" CHECK ("movimientos"."tipo" in ('ingreso','gasto','arrastre_sobrante','aporte_meta','retiro_meta','reversion','cargo_tarjeta','pago_tarjeta'));--> statement-breakpoint
CREATE POLICY "tarjetas_aislamiento_tenant" ON "tarjetas" AS PERMISSIVE FOR ALL TO "app_backend" USING ("tarjetas"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("tarjetas"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "cargos_tarjeta_aislamiento_tenant" ON "cargos_tarjeta" AS PERMISSIVE FOR ALL TO "app_backend" USING ("cargos_tarjeta"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("cargos_tarjeta"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "pagos_tarjeta_aislamiento_tenant" ON "pagos_tarjeta" AS PERMISSIVE FOR ALL TO "app_backend" USING ("pagos_tarjeta"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("pagos_tarjeta"."tenant_id" = current_setting('app.tenant_id', true)::uuid);