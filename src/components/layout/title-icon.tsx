import { cn } from "@/lib/utils";

/**
 * Brand icon (vintage comic-tile webp) for page H1 titles.
 * Reuses the sidebar nav icons in `public/nav/` so page headers and the
 * sidebar stay visually consistent. `name` is the file stem (e.g. "brand-brain").
 */
export function TitleIcon({ name, className }: { name: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/nav/${name}.webp`}
      alt=""
      aria-hidden="true"
      className={cn("inline-block w-7 h-7 object-contain align-[-0.3em] mr-1.5", className)}
    />
  );
}
