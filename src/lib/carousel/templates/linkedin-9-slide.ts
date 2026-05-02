import type { CarouselTemplate, RenderSlideInput } from "@/lib/carousel/types";
import { wrapHtmlDoc } from "@/lib/carousel/render";

/**
 * 9-slide LinkedIn carousel inspired by Growth4U's `linkedin-pipeline` repo
 * (github.com/Growth4U-systems/linkedin-pipeline). 1080×1350 vertical,
 * gradient navy background, mint accent stripe on the left, big ghosted slide
 * number, brand pill at the top, footer with logo + handle.
 *
 * Structure: 1 cover + 7 body + 1 cta.
 *
 * Slot model: a single `script` slot collects the post copy as one block; the
 * skill that owns the draft (or the human via the composer form) splits it
 * per-slide using `slide_title` / `slide_body` perSlide values.
 */
export const linkedin9SlideTemplate: CarouselTemplate = {
  id: "linkedin-9-slide",
  name: "LinkedIn · Carrusel 9 slides",
  channel: "linkedin",
  description:
    "Carrusel vertical 1080×1350: portada + 7 contenido + CTA. Stripe lateral, número grande de slide, footer con logo. Estilo Growth Systems.",
  slideCount: 9,
  width: 1080,
  height: 1350,
  preview: {
    variant: "gradient-navy",
    lines: [
      { kind: "badge", width: 30 },
      { kind: "title", width: 95 },
      { kind: "title", width: 80 },
      { kind: "title", width: 60 },
      { kind: "footer", width: 100 },
    ],
  },
  slots: [
    { key: "cover_title", label: "Título de portada", multiline: true, placeholder: "El creativo pesa más que el targeting", maxLength: 120 },
    { key: "cover_sub", label: "Subtítulo de portada", placeholder: "Andromeda de Meta lo confirma · 2026", maxLength: 100 },
    { key: "cta_title", label: "CTA — pregunta", placeholder: "¿Tu agencia sigue cobrándote por gestión de audiencias?", maxLength: 120 },
    { key: "cta_text", label: "CTA — invitación", multiline: true, placeholder: "Comenta o DM con tu cifra. Renegocia.", maxLength: 200 },
    {
      key: "slide_title",
      label: "Headline de la slide",
      perSlide: true,
      placeholder: "Ej: 'El dato', 'Lo que pasa', 'Acción 1'",
      maxLength: 50,
    },
    {
      key: "slide_text",
      label: "Cuerpo de la slide",
      perSlide: true,
      multiline: true,
      placeholder: "2-4 líneas, máx 25 palabras por línea.",
      maxLength: 280,
    },
  ],
  render(input: RenderSlideInput) {
    const { slots, perSlide, slideIndex, totalSlides, brand } = input;
    const n = String(slideIndex + 1).padStart(2, "0");
    const handle = brand.footerText || (brand.name ? `@${brand.name.toLowerCase().replace(/\s+/g, "")}` : `@${brand.slug}`);
    const accent = brand.accentColor || "#3ECDA5";
    const ink = brand.primaryColor || "#032149";
    const logoUrl = brand.logoUrl;

    let inner = "";
    if (slideIndex === 0) {
      const title = escape(slots.cover_title || "Tu título aquí");
      const sub = escape(slots.cover_sub || "");
      inner = `
        <div class="slide cover">
          <div class="s-num">${n}</div>
          <div class="brand-top"><span class="dot"></span>Growth Systems</div>
          <div class="s-body-wrap">
            <h1 class="s-title">${title}</h1>
            ${sub ? `<div class="s-sub">${sub}</div>` : ""}
          </div>
          ${footer(handle, logoUrl)}
        </div>
      `;
    } else if (slideIndex === totalSlides - 1) {
      const title = escape(slots.cta_title || "¿Cuál es tu take?");
      const text = escape(slots.cta_text || "Comenta abajo o DM con tu cifra.");
      inner = `
        <div class="slide cta">
          <div class="s-num">${n}</div>
          <div class="brand-top"><span class="dot"></span>Tu turno</div>
          <div class="s-body-wrap">
            <h1 class="s-title">${title}</h1>
            <div class="s-text">${text}</div>
          </div>
          ${footer(handle, logoUrl)}
        </div>
      `;
    } else {
      const title = escape(perSlide.slide_title?.[slideIndex] || `Slide ${slideIndex + 1}`);
      const text = escape(perSlide.slide_text?.[slideIndex] || "");
      inner = `
        <div class="slide">
          <div class="s-num">${n}</div>
          <div class="brand-top"><span class="dot"></span>${title}</div>
          <div class="s-body-wrap">
            <div class="s-text">${text}</div>
          </div>
          ${footer(handle, logoUrl)}
        </div>
      `;
    }

    return wrapHtmlDoc(`
      ${inner}
      <style>
        :root { --navy: ${ink}; --accent: ${accent}; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif; background: #f6f8fb; }
        .slide {
          width: 1080px; height: 1350px;
          background: linear-gradient(155deg, #041a3a, var(--navy));
          color: #fff;
          padding: 96px 80px;
          position: relative;
          display: flex; flex-direction: column; justify-content: space-between;
          overflow: hidden;
        }
        .slide::after {
          content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 10px;
          background: linear-gradient(180deg, var(--accent), #0FAEC1, #45B6F7);
        }
        .slide .brand-top {
          display: inline-flex; align-items: center; gap: 14px;
          font-size: 22px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
          color: var(--accent);
          padding: 10px 24px;
          border: 2px solid rgba(62,205,165,.35);
          border-radius: 99px;
          background: rgba(62,205,165,.08);
          align-self: flex-start;
          max-width: 100%;
        }
        .slide .brand-top .dot { width: 14px; height: 14px; background: var(--accent); border-radius: 50%; }
        .slide .s-title {
          font-size: 76px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.10;
        }
        .slide .s-sub { font-size: 36px; color: rgba(255,255,255,.78); margin-top: 28px; line-height: 1.30; }
        .slide .s-text { font-size: 44px; line-height: 1.35; color: rgba(255,255,255,.95); white-space: pre-line; font-weight: 500; }
        .slide .s-body-wrap { display: flex; flex-direction: column; gap: 32px; flex: 1; justify-content: center; }
        .slide .s-foot {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 22px; color: rgba(255,255,255,.65);
          padding-top: 28px;
          border-top: 1px solid rgba(255,255,255,.10);
        }
        .slide .s-foot .logo-img { height: 44px; width: auto; opacity: .95; }
        .slide .s-foot .handle { font-weight: 600; }
        .slide .s-num {
          position: absolute; top: 56px; right: 64px;
          font-size: 100px; font-weight: 800;
          color: transparent;
          -webkit-text-stroke: 2.5px rgba(62,205,165,.42);
        }
        .slide.cover .s-title { font-size: 88px; line-height: 1.04; }
        .slide.cta .s-title { color: var(--accent); font-size: 64px; }
        .slide.cta .s-text {
          font-size: 38px;
          padding: 28px 32px;
          border-left: 6px solid var(--accent);
          background: rgba(62,205,165,.08);
          border-radius: 0 16px 16px 0;
        }
      </style>
    `);
  },
};

function footer(handle: string, logoUrl: string | null | undefined): string {
  if (logoUrl) {
    return `<div class="s-foot"><img class="logo-img" src="${escape(logoUrl)}" alt="" /><span class="handle">${escape(handle)}</span></div>`;
  }
  return `<div class="s-foot"><span class="handle">${escape(handle)}</span></div>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
