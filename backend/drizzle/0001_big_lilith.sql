CREATE TABLE "asientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"movimiento_id" uuid NOT NULL,
	"cuenta_id" uuid,
	"monto_valor_minimo" bigint NOT NULL,
	"moneda" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asientos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cuentas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cuentas_tipo_valido" CHECK ("cuentas"."tipo" in ('periodo','meta','efectivo','banco','tarjeta'))
);
--> statement-breakpoint
ALTER TABLE "cuentas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "movimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"moneda" text NOT NULL,
	"fecha_efectiva" date NOT NULL,
	"fecha_registro" timestamp with time zone DEFAULT now() NOT NULL,
	"nota" text,
	"movimiento_revertido_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimientos_tipo_valido" CHECK ("movimientos"."tipo" in ('ingreso','gasto','arrastre_sobrante','aporte_meta','retiro_meta','reversion'))
);
--> statement-breakpoint
ALTER TABLE "movimientos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "asientos" ADD CONSTRAINT "asientos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asientos" ADD CONSTRAINT "asientos_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asientos" ADD CONSTRAINT "asientos_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_movimiento_revertido_id_movimientos_id_fk" FOREIGN KEY ("movimiento_revertido_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "asientos_aislamiento_tenant" ON "asientos" AS PERMISSIVE FOR ALL TO "app_backend" USING ("asientos"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("asientos"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "cuentas_aislamiento_tenant" ON "cuentas" AS PERMISSIVE FOR ALL TO "app_backend" USING ("cuentas"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("cuentas"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "movimientos_aislamiento_tenant" ON "movimientos" AS PERMISSIVE FOR ALL TO "app_backend" USING ("movimientos"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("movimientos"."tenant_id" = current_setting('app.tenant_id', true)::uuid);