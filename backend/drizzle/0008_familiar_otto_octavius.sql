CREATE TABLE "resumenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"periodo_id" uuid NOT NULL,
	"total_ingresos_valor_minimo" bigint NOT NULL,
	"total_gastado_valor_minimo" bigint NOT NULL,
	"sobrante_valor_minimo" bigint NOT NULL,
	"moneda" text NOT NULL,
	"decision_sobrante" text DEFAULT 'pendiente' NOT NULL,
	"decision_sobrante_fecha" timestamp with time zone,
	"generado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resumenes_periodo_unico" UNIQUE("periodo_id"),
	CONSTRAINT "resumenes_decision_valida" CHECK ("resumenes"."decision_sobrante" in ('pendiente','ahorrado','arrastrado')),
	CONSTRAINT "resumenes_decision_fecha_consistente" CHECK (("resumenes"."decision_sobrante" = 'pendiente' and "resumenes"."decision_sobrante_fecha" is null)
          or ("resumenes"."decision_sobrante" <> 'pendiente' and "resumenes"."decision_sobrante_fecha" is not null))
);
--> statement-breakpoint
ALTER TABLE "resumenes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resumenes" ADD CONSTRAINT "resumenes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumenes" ADD CONSTRAINT "resumenes_periodo_id_periodos_id_fk" FOREIGN KEY ("periodo_id") REFERENCES "public"."periodos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "resumenes_aislamiento_tenant" ON "resumenes" AS PERMISSIVE FOR ALL TO "app_backend" USING ("resumenes"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("resumenes"."tenant_id" = current_setting('app.tenant_id', true)::uuid);