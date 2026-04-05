import { useRouter } from "next/router";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/stores/app";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const t = useTranslations();
  const router = useRouter();
  const { locale, setLocale, toggleSidebar } = useAppStore();

  // Build breadcrumbs from path
  const parts = router.asPath
    .replace(/^\/dashboard\/?/, "")
    .split("/")
    .filter(Boolean);

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border px-6 py-3 flex items-center gap-4">
      {/* Sidebar toggle */}
      <button
        onClick={toggleSidebar}
        className="text-muted-foreground hover:text-foreground text-lg"
        title="Toggle sidebar"
      >
        ☰
      </button>

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">
          {t("nav.dashboard")}
        </Link>
        {parts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-border">/</span>
            <span className={i === parts.length - 1 ? "text-foreground font-medium" : ""}>
              {decodeURIComponent(part)}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Language selector */}
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-muted text-muted-foreground">
          🌐 {locale === "es" ? "ES" : "EN"}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => setLocale("es")}>
            {t("language.es")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocale("en")}>
            {t("language.en")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
