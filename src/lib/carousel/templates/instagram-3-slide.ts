import type { CarouselTemplate } from "@/lib/carousel/types";
import { wrapHtmlDoc } from "@/lib/carousel/render";

/**
 * Three-slide Instagram carousel (1080×1080). Slide 1 is a hook cover,
 * slides 2 and 3 are body content with a header + bullets. Slide N renders
 * a "{n}/3" page indicator in the corner so swipes feel intentional.
 */
export const instagram3SlideTemplate: CarouselTemplate = {
  id: "instagram-3-slide",
  name: "Instagram · Carrusel 3 slides",
  channel: "instagram",
  description: "3 slides cuadradas: portada + 2 contenido. Ideal para frameworks o listas.",
  slideCount: 3,
  width: 1080,
  height: 1080,
  preview: {
    variant: "gradient-navy",
    lines: [
      { kind: "badge", width: 25 },
      { kind: "title", width: 85 },
      { kind: "text", width: 65 },
      { kind: "footer", width: 100 },
    ],
  },
  slots: [
    { key: "cover_hook", label: "Hook portada", multiline: true, placeholder: "El playbook que nadie te enseña.", maxLength: 100 },
    { key: "cover_subtitle", label: "Subtítulo portada", placeholder: "5 pasos en 60s" },
    {
      key: "slide_heading",
      label: "Heading de la slide",
      perSlide: true,
      placeholder: "ej: 1. Diagnostica · 2. Diseña · 3. Distribuye",
      maxLength: 60,
    },
    {
      key: "slide_body",
      label: "Cuerpo de la slide",
      perSlide: true,
      multiline: true,
      placeholder: "El bullet point principal de esta slide.",
      maxLength: 300,
    },
  ],
  render({ slots, perSlide, slideIndex, totalSlides, brand }) {
    const accent = brand.accentColor || "#C45A2F";
    const ink = brand.primaryColor || "#1A2C42";
    const handle = brand.name || brand.slug;
    const logo = brand.logoUrl;
    const counter = `${slideIndex + 1} / ${totalSlides}`;

    if (slideIndex === 0) {
      const hook = escape(slots.cover_hook || "Tu hook aquí.");
      const subtitle = escape(slots.cover_subtitle || "");
      return wrapHtmlDoc(`
        <div class="slide cover" style="background:${ink};color:white;">
          <div class="counter" style="background:${accent}">${counter}</div>
          <h1 class="hook">${hook}</h1>
          ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
          <div class="brand">
            ${logo ? `<img src="${escape(logo)}" class="logo" alt="" />` : ""}
            <span>@${escape(handle)}</span>
            <span class="swipe">→ desliza</span>
          </div>
        </div>
        ${commonStyles({ accent, ink, font: brand.font })}
      `);
    }

    // Body slides: one heading + one body, per-slide values pulled out of perSlide map.
    const heading = escape(perSlide.slide_heading?.[slideIndex] || `Slide ${slideIndex + 1}`);
    const body = escape(perSlide.slide_body?.[slideIndex] || "");
    return wrapHtmlDoc(`
      <div class="slide body" style="background:white;color:${ink};">
        <div class="counter outline" style="border-color:${accent};color:${accent}">${counter}</div>
        <h2 class="heading">${heading}</h2>
        <p class="body-text">${body}</p>
        <div class="brand muted">
          ${logo ? `<img src="${escape(logo)}" class="logo" alt="" />` : ""}
          <span>@${escape(handle)}</span>
          <span class="accent-strip" style="background:${accent}"></span>
        </div>
      </div>
      ${commonStyles({ accent, ink, font: brand.font })}
    `);
  },
};

function commonStyles(opts: { accent: string; ink: string; font?: string }): string {
  return `
    <style>
      .slide {
        width: 1080px; height: 1080px;
        padding: 80px; box-sizing: border-box;
        position: relative; overflow: hidden;
        font-family: ${opts.font || "'Inter', system-ui, sans-serif"};
        display: flex; flex-direction: column;
      }
      .counter {
        position: absolute; top: 32px; right: 32px;
        padding: 8px 16px; border-radius: 999px;
        font-size: 22px; font-weight: 700; color: white;
      }
      .counter.outline { background: white; border: 2px solid; }
      .cover .hook {
        font-size: 92px; font-weight: 900; line-height: 1.05;
        margin: auto 0 16px; max-width: 920px;
      }
      .cover .subtitle {
        font-size: 30px; font-weight: 500; opacity: 0.85;
        margin-bottom: auto; padding-bottom: 60px;
      }
      .body .heading {
        font-size: 56px; font-weight: 800; line-height: 1.15;
        margin: 60px 0 32px; max-width: 920px;
      }
      .body .body-text {
        font-size: 34px; font-weight: 400; line-height: 1.4;
        margin: 0 0 auto; max-width: 920px;
      }
      .brand {
        margin-top: auto; display: flex; align-items: center; gap: 16px;
        font-size: 22px; font-weight: 600;
      }
      .brand.muted { opacity: 0.65; }
      .brand .logo { height: 40px; width: auto; }
      .swipe { margin-left: auto; opacity: 0.7; font-weight: 400; }
      .accent-strip { width: 80px; height: 6px; margin-left: auto; }
    </style>
  `;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
