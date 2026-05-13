/**
 * Resuelve el "scope" (subcarpeta del brand a registrar como proyecto OD) y el
 * archivo dentro de ese scope, a partir de un BrandAsset.
 *
 * Modelo: en vez de tener 1 proyecto OD = brand entero (con 1000+ archivos),
 * cada subcarpeta lógica del brand-book es un proyecto OD independiente. El
 * editor agentic se abre enfocado al folder relevante (p.ej. una plantilla
 * concreta con sus 3 slides + meta.json).
 */

import type { BrandAsset } from "@/hooks/useBrandAssets";

export interface AssetScopeResolution {
  /** Path relativo al brand (sin `brand/<slug>/`). Es el baseDir del proyecto OD. */
  scope: string;
  /** Path relativo al scope. Es el `fileName` para el deep-link OD `/files/<file>`. */
  file: string;
}

/** Calcula scope+file para abrir un asset en el editor de Open Design. */
export function scopeAndFileFor(asset: BrandAsset): AssetScopeResolution {
  // Plantillas (directorio con varios slides): el directorio entero ES el scope.
  // El file es el entryFile o slide-cover/template como default.
  if (asset.kind === "template") {
    const entryFile = asset.entryFile;
    if (entryFile) {
      // entryFile es relativo al brand: brand-book/visual-identity/templates/linkedin-9-slide/slide-cover.html
      // scope: brand-book/visual-identity/templates/linkedin-9-slide
      // file:  slide-cover.html
      const prefix = asset.relativePath + "/";
      return {
        scope: asset.relativePath,
        file: entryFile.startsWith(prefix) ? entryFile.slice(prefix.length) : entryFile,
      };
    }
    // No entry file detectado — abrir el directorio sin file específico.
    return { scope: asset.relativePath, file: "" };
  }

  // Mockup como directorio compuesto (raro): igual que template.
  if (asset.kind === "mockup" && asset.entryFile) {
    const prefix = asset.relativePath + "/";
    return {
      scope: asset.relativePath,
      file: asset.entryFile.startsWith(prefix) ? asset.entryFile.slice(prefix.length) : asset.entryFile,
    };
  }

  // Archivo individual: scope = directorio padre, file = nombre del archivo.
  // Ejemplos:
  //   logo-light.webp                                            → scope=brand-book/visual-identity, file=logo-light.webp
  //   brand-book/visual-identity/mockups/foo.webp                → scope=…/mockups, file=foo.webp
  //   brand-book/visual-identity/DESIGN.md                       → scope=brand-book/visual-identity, file=DESIGN.md
  //   brand-book/visual-identity/style-references/x.webp         → scope=…/style-references, file=x.webp
  //   brand-book/visual-identity/exports/foo.pdf                 → scope=…/exports, file=foo.pdf
  const parts = asset.relativePath.split("/");
  if (parts.length === 1) {
    // Asset en raíz del brand — sin subscope, usa brand entero.
    return { scope: "", file: parts[0] };
  }
  return {
    scope: parts.slice(0, -1).join("/"),
    file: parts[parts.length - 1],
  };
}

/** Construye el href interno de MC al editor con scope+file. */
export function buildEditorHrefWithScope(slug: string, asset: BrandAsset): string {
  const { scope, file } = scopeAndFileFor(asset);
  const params = new URLSearchParams();
  if (scope) params.set("scope", scope);
  if (file) params.set("file", file);
  return `/dashboard/${encodeURIComponent(slug)}/media-creation/editor?${params.toString()}`;
}
