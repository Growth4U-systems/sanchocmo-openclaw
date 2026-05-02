import type { CarouselTemplate } from "@/lib/carousel/types";
import { wrapHtmlDoc } from "@/lib/carousel/render";

/**
 * Single-slide LinkedIn feed image (1.91:1 = 1200×628). A bold quote on a
 * branded background with attribution + brand mark in the corner.
 */
export const linkedinQuoteTemplate: CarouselTemplate = {
  id: "linkedin-quote",
  name: "LinkedIn · Cita",
  channel: "linkedin",
  description: "Una frase fuerte sobre fondo de marca, ratio 1.91:1.",
  slideCount: 1,
  width: 1200,
  height: 628,
  preview: {
    variant: "gradient-navy",
    lines: [
      { kind: "badge", width: 25 },
      { kind: "title", width: 90 },
      { kind: "title", width: 70 },
      { kind: "footer", width: 100 },
    ],
  },
  slots: [
    { key: "headline", label: "Cita", multiline: true, placeholder: "La frase clave del post.", maxLength: 220 },
    { key: "attribution", label: "Atribución", placeholder: "— growth4u" },
    { key: "context", label: "Contexto (línea pequeña)", placeholder: "MiCA · julio 2026" },
  ],
  render({ slots, brand }) {
    const headline = escape(slots.headline || "Tu cita aquí.");
    const attribution = escape(slots.attribution || `— ${brand.name || brand.slug}`);
    const context = escape(slots.context || "");
    const accent = brand.accentColor || "#C45A2F";
    const ink = brand.primaryColor || "#1A2C42";
    const logo = brand.logoUrl;

    return wrapHtmlDoc(`
      <div class="slide" style="background:${ink};color:white;">
        <div class="badge">${context}</div>
        <h1 class="headline">${headline}</h1>
        <div class="footer">
          <div class="attribution">${attribution}</div>
          ${logo ? `<img class="logo" src="${escape(logo)}" alt="" />` : `<div class="brand-mark" style="color:${accent}">${escape(brand.name || brand.slug)}</div>`}
        </div>
        <div class="accent" style="background:${accent}"></div>
      </div>
      <style>
        .slide {
          width: 1200px; height: 628px;
          padding: 80px 96px; box-sizing: border-box;
          position: relative; overflow: hidden;
          font-family: ${brand.font || "'Inter', system-ui, sans-serif"};
          display: flex; flex-direction: column; justify-content: space-between;
        }
        .badge {
          font-size: 18px; letter-spacing: 0.18em; text-transform: uppercase;
          opacity: 0.7; font-weight: 600;
        }
        .headline {
          font-size: 64px; font-weight: 800; line-height: 1.12;
          margin: 0; max-width: 1000px;
        }
        .footer {
          display: flex; justify-content: space-between; align-items: flex-end;
          gap: 32px;
        }
        .attribution { font-size: 22px; font-weight: 500; opacity: 0.85; }
        .logo { height: 56px; width: auto; }
        .brand-mark { font-size: 28px; font-weight: 800; }
        .accent {
          position: absolute; bottom: 0; left: 0; right: 0; height: 8px;
        }
      </style>
    `);
  },
};

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
