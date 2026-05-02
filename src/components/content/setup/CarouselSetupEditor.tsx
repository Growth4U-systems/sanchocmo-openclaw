"use client";

import Image from "next/image";
import { useMemo, useState, type ReactNode } from "react";
import {
  useAllCarouselTemplates,
  useEffectiveContentConfig,
  useUpdateContentConfig,
} from "@/hooks/useContentConfig";
import { ConfigField } from "@/components/content/setup/ConfigField";
import {
  ScErrorBox,
  ScLabel,
} from "@/components/content/setup/sc-primitives";
import { TemplateThumbnail } from "@/components/content/setup/TemplateThumbnail";

type LogoStatus = "present" | "missing-registered" | "pending";

function logoHintForStatus(status: LogoStatus): ReactNode {
  if (status === "present") {
    return (
      <>
        Cargado desde <code className="px-1 rounded" style={{ background: "var(--sc-sun-50)" }}>brand-book/visual-identity/logo-light.png</code>.
      </>
    );
  }
  if (status === "missing-registered") {
    return (
      <>
        El skill <code className="px-1 rounded" style={{ background: "var(--sc-sun-50)" }}>visual-identity</code> registró que esta brand no tiene logo todavía.
      </>
    );
  }
  return (
    <>
      MC busca <code className="px-1 rounded" style={{ background: "var(--sc-sun-50)" }}>brand-book/visual-identity/logo-light.png</code> primero.
      Lo recomendado es lanzar el skill <code className="px-1 rounded" style={{ background: "var(--sc-sun-50)" }}>visual-identity</code> que lo coloca ahí.
    </>
  );
}

function logoPendingHelp(status: LogoStatus, reason: string | null): ReactNode {
  if (status === "missing-registered") {
    return (
      <>
        El cliente no tiene logo PNG y eso ya está registrado en el brand-book
        {reason ? <> ({reason})</> : null}. Si quieres uno solo para los carruseles, pega una URL custom aquí — se usará como override sin tocar el brand-book.
      </>
    );
  }
  return (
    <>
      No hay logo PNG ni registro de &ldquo;missing&rdquo; en el brand-book. Lo correcto es lanzar el skill{" "}
      <code className="px-1 rounded" style={{ background: "var(--sc-paper-2)" }}>visual-identity</code> para que haga el intake y deje el archivo
      en <code className="px-1 rounded" style={{ background: "var(--sc-paper-2)" }}>brand-book/visual-identity/logo-light.png</code>.
      Si necesitas uno provisional, pégalo aquí.
    </>
  );
}

/**
 * Contenido editable del panel "Carrusel — branding & plantillas". Vive
 * dentro de un slide-over abierto desde el row resumen. Sin ScCard wrapper.
 *
 * El toggle de plantillas usa optimistic UI: el cambio se ve instantáneo y
 * la mutation persiste en background. Si el server falla, el optimistic se
 * revierte cuando llega el error de la mutation.
 */
export function CarouselSetupEditor({ slug }: { slug: string }) {
  const config = useEffectiveContentConfig(slug);
  const templatesQ = useAllCarouselTemplates(slug);
  const update = useUpdateContentConfig();

  // Optimistic enabled set — null means "use server snapshot".
  const [optimistic, setOptimistic] = useState<Set<string> | null>(null);

  // Reset the optimistic overlay when a fresh server snapshot arrives.
  const serverEnabledIds = useMemo(
    () => (templatesQ.data || []).filter((t) => t.enabled).map((t) => t.id),
    [templatesQ.data],
  );
  const enabledSet = optimistic ?? new Set(serverEnabledIds);

  if (config.isLoading || templatesQ.isLoading || !config.data) {
    return <p className="text-sm" style={{ color: "var(--sc-fg-muted)" }}>Cargando carrusel setup...</p>;
  }

  const eff = config.data.effective.carousel;
  const bb = config.data.brand_book;

  function persistCarousel(patch: Record<string, string | string[] | null>) {
    update.mutate({ slug, carousel: patch });
  }

  function handleToggleTemplate(id: string) {
    if (!templatesQ.data) return;
    const all = templatesQ.data.map((t) => t.id);
    const next = new Set(enabledSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOptimistic(next);
    const persisted = next.size === all.length ? null : Array.from(next);
    update.mutate(
      { slug, carousel: { enabled_templates: persisted } },
      {
        // When the server snapshot lands, drop our optimistic overlay so the
        // server is the source of truth again.
        onSettled: () => setOptimistic(null),
      },
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: "var(--sc-fg-soft)" }}>
        Lo que ya está en{" "}
        <code className="px-1 rounded" style={{ background: "var(--sc-paper-2)" }}>brand-book/visual-identity/</code>{" "}
        se aplica automáticamente. Aquí solo se llenan los huecos o se sobrescribe puntualmente.
      </p>

      <ConfigField
        label="Color primario"
        hint="Fondo de las slides (gradient base)."
        source={eff.primary_color.source}
        display={
          <span className="flex items-center gap-2 font-mono">
            <span
              className="inline-block w-4 h-4 rounded border"
              style={{ background: eff.primary_color.value || "transparent", borderColor: "var(--sc-ink)" }}
            />
            {eff.primary_color.value || "—"}
          </span>
        }
        inputValue={eff.primary_color.value || ""}
        inputType="color"
        inputPlaceholder="#032149"
        pendingHelp="Falta en design-tokens.json. Define un color primario o lánzalo desde el skill content-engine-setup."
        saving={update.isPending}
        onSave={(v) => persistCarousel({ primary_color: v || null })}
        onReset={() => persistCarousel({ primary_color: null })}
      />

      <ConfigField
        label="Color acento"
        hint="Stripe lateral, números, badges."
        source={eff.accent_color.source}
        display={
          <span className="flex items-center gap-2 font-mono">
            <span
              className="inline-block w-4 h-4 rounded border"
              style={{ background: eff.accent_color.value || "transparent", borderColor: "var(--sc-ink)" }}
            />
            {eff.accent_color.value || "—"}
          </span>
        }
        inputValue={eff.accent_color.value || ""}
        inputType="color"
        inputPlaceholder="#0FAEC1"
        pendingHelp="Falta. Define un color de acento."
        saving={update.isPending}
        onSave={(v) => persistCarousel({ accent_color: v || null })}
        onReset={() => persistCarousel({ accent_color: null })}
      />

      <ConfigField
        label="Logo"
        hint={logoHintForStatus(bb.logo_status)}
        source={eff.logo_url.source}
        display={
          <span className="flex items-center gap-2">
            {eff.logo_url.value && (
              <Image
                src={eff.logo_url.value}
                alt=""
                width={80}
                height={28}
                unoptimized
                className="h-7 w-auto object-contain rounded"
                style={{ background: "var(--sc-paper-2)" }}
              />
            )}
            <span className="text-xs font-mono truncate">{eff.logo_url.value}</span>
          </span>
        }
        inputValue={eff.logo_url.value || ""}
        inputType="url"
        inputPlaceholder="https://r2.../logo-light.png"
        pendingHelp={logoPendingHelp(bb.logo_status, bb.logo_missing_reason)}
        saving={update.isPending}
        onSave={(v) => persistCarousel({ logo_url: v || null })}
        onReset={() => persistCarousel({ logo_url: null })}
      />

      <ConfigField
        label="Footer text · handle"
        hint="Aparece junto al logo en cada slide."
        source={eff.footer_text.source}
        display={<span className="font-mono">{eff.footer_text.value || "—"}</span>}
        inputValue={eff.footer_text.value || ""}
        inputType="text"
        inputPlaceholder="@growth4u · Growth Systems"
        pendingHelp="No está en el brand-book. Pega tu handle (LinkedIn / IG) o lánzalo desde el skill content-engine-setup."
        saving={update.isPending}
        onSave={(v) => persistCarousel({ footer_text: v || null })}
        onReset={() => persistCarousel({ footer_text: null })}
      />

      {/* Templates */}
      <div className="pt-4 border-t-2 border-dashed space-y-2" style={{ borderColor: "var(--sc-ink)" }}>
        <ScLabel>Plantillas habilitadas</ScLabel>
        <p className="text-xs" style={{ color: "var(--sc-fg-soft)" }}>
          Click sobre la plantilla para activarla o desactivarla. El cambio es inmediato.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          {(templatesQ.data || []).map((t) => {
            const isActive = enabledSet.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleToggleTemplate(t.id)}
                className="text-left p-3 rounded-sc-md border-[2px] sc-pop-hover w-full"
                style={{
                  background: isActive ? "var(--sc-sun-100)" : "var(--sc-paper-3)",
                  borderColor: "var(--sc-ink)",
                  boxShadow: "var(--pop-sm)",
                  opacity: isActive ? 1 : 0.65,
                }}
              >
                <TemplateThumbnail
                  preview={t.preview}
                  width={t.width}
                  height={t.height}
                  primaryColor={eff.primary_color.value}
                  accentColor={eff.accent_color.value}
                />
                <div className="flex items-center gap-2 mt-2.5">
                  <span className="font-heading font-bold text-sm flex-1 truncate" style={{ color: "var(--sc-ink)" }}>
                    {t.name}
                  </span>
                  <span
                    className="font-heading uppercase text-[10px] tracking-wider px-1.5 py-0.5 rounded-sc-pill border shrink-0"
                    style={{
                      background: "var(--sc-paper-2)",
                      borderColor: "var(--sc-ink)",
                      color: "var(--sc-fg-muted)",
                    }}
                  >
                    {t.channel}
                  </span>
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--sc-fg-muted)" }}>
                  {t.description}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] font-mono" style={{ color: "var(--sc-fg-subtle)" }}>
                    {t.width}×{t.height} · {t.slideCount} slide{t.slideCount > 1 ? "s" : ""}
                  </span>
                  <span
                    className="font-heading uppercase text-[10px] tracking-wider"
                    style={{ color: isActive ? "var(--sc-sage-500)" : "var(--sc-fg-subtle)" }}
                  >
                    {isActive ? "✓ Activa" : "Inactiva"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {update.isError && <ScErrorBox>{update.error.message}</ScErrorBox>}
    </div>
  );
}
