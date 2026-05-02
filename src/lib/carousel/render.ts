import { chromium, type Browser } from "playwright";

/**
 * Render an HTML fragment to a PNG buffer at a fixed viewport size. Reuses a
 * single Chromium instance across calls in the same Node process so we don't
 * pay the ~1s launch cost on every slide.
 *
 * The HTML passed in is wrapped in a minimal HTML document via `wrapHtmlDoc`
 * (templates call it directly). Loading external fonts / images is awaited
 * via `networkidle` so the screenshot has them rendered.
 */

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
    // If the browser dies, drop the cached promise so the next call relaunches.
    browserPromise
      .then((b) => b.on("disconnected", () => { browserPromise = null; }))
      .catch(() => { browserPromise = null; });
  }
  return browserPromise;
}

export interface RenderHtmlOptions {
  width: number;
  height: number;
  /** Max wait for fonts/images. Defaults to 3s — templates are static. */
  timeoutMs?: number;
}

export async function renderHtmlToPng(html: string, opts: RenderHtmlOptions): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  try {
    await page.setContent(html, {
      waitUntil: "networkidle",
      timeout: opts.timeoutMs ?? 3000,
    });
    const buffer = await page.screenshot({
      type: "png",
      omitBackground: false,
      clip: { x: 0, y: 0, width: opts.width, height: opts.height },
    });
    return buffer;
  } finally {
    await context.close();
  }
}

/**
 * Render an array of slide HTML fragments as a multi-page PDF with one page
 * per slide. Used to build LinkedIn carousels — LinkedIn shows a swipeable
 * carousel only when the upload is a PDF, not when it's a list of images.
 *
 * `pageWidth` / `pageHeight` are in CSS pixels. Playwright maps 96 px = 1 in,
 * so for a 1080×1080 slide we ask for an 11.25in × 11.25in PDF page.
 */
export async function renderSlidesToPdf(
  slideHtmls: string[],
  opts: RenderHtmlOptions,
): Promise<Buffer> {
  if (slideHtmls.length === 0) throw new Error("renderSlidesToPdf: empty slides[]");
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  try {
    // Concatenate all slides with hard page breaks between them. Each
    // template's outermost element is sized to the slide, so wrapping in a
    // `.page-break` div is enough.
    const stitched = slideHtmls.join('\n<div style="page-break-after: always;"></div>\n');
    const wrapped = wrapHtmlDoc(`
      <style>
        @page { margin: 0; size: ${opts.width}px ${opts.height}px; }
        body { margin: 0; }
      </style>
      ${stitched}
    `);
    await page.setContent(wrapped, {
      waitUntil: "networkidle",
      timeout: opts.timeoutMs ?? 5000,
    });
    const pdfBuffer = await page.pdf({
      width: `${opts.width}px`,
      height: `${opts.height}px`,
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await context.close();
  }
}

/**
 * Wrap a fragment (the inner HTML a template produces) in a full document
 * with sensible defaults: Inter font, no margins, antialiasing on. Templates
 * call this so they only need to write the slide markup + their own styles.
 */
export function wrapHtmlDoc(fragment: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { font-family: 'Inter', system-ui, sans-serif; }
  </style>
</head>
<body>
${fragment}
</body>
</html>`;
}
