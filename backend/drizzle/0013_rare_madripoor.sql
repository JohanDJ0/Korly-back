CREATE TABLE "gastos_recurrentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"descripcion" text NOT NULL,
	"monto_valor_minimo" bigint NOT NULL,
	"moneda" text NOT NULL,
	"categoria_id" uuid,
	"frecuencia" text NOT NULL,
	"dia_mes" smallint,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gastos_recurrentes_monto_positivo" CHECK ("gastos_recurrentes"."monto_valor_minimo" > 0),
	CONSTRAINT "gastos_recurrentes_frecuencia_valida" CHECK ("gastos_recurrentes"."frecuencia" in ('quincenal', 'mensual')),
	CONSTRAINT "gastos_recurrentes_dia_mes_coherente" CHECK (("gastos_recurrentes"."frecuencia" = 'mensual' AND "gastos_recurrentes"."dia_mes" BETWEEN 1 AND 31) OR ("gastos_recurrentes"."frecuencia" = 'quincenal' AND "gastos_recurrentes"."dia_mes" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "gastos_recurrentes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN "origen_recurrente_id" uuid;--> statement-breakpoint
ALTER TABLE "gastos_recurrentes" ADD CONSTRAINT "gastos_recurrentes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos_recurrentes" ADD CONSTRAINT "gastos_recurrentes_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_origen_recurrente_id_gastos_recurrentes_id_fk" FOREIGN KEY ("origen_recurrente_id") REFERENCES "public"."gastos_recurrentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gastos_recurrente_periodo_unico" ON "gastos" USING btree ("origen_recurrente_id","periodo_id") WHERE "gastos"."origen_recurrente_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "gastos_recurrentes_aislamiento_tenant" ON "gastos_recurrentes" AS PERMISSIVE FOR ALL TO "app_backend" USING ("gastos_recurrentes"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("gastos_recurrentes"."tenant_id" = current_setting('app.tenant_id', true)::uuid);