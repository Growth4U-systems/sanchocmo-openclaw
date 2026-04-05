import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import Head from "next/head";
import ReactMarkdown from "react-markdown";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default function DocViewerPage() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const pathParts = router.query.path;
  const docPath = Array.isArray(pathParts) ? pathParts.join("/") : pathParts || "";
  const fullPath = slug ? `${slug}/${docPath}` : docPath;

  const { data, isLoading, error } = useQuery({
    queryKey: ["doc", fullPath],
    queryFn: async () => {
      const res = await fetch(`/api/chat/doc/${fullPath}`);
      if (!res.ok) throw new Error("Document not found");
      return res.json();
    },
    enabled: !!fullPath && !!slug,
  });

  const content = data?.content || "";
  const fileName = docPath.split("/").pop() || "Document";

  return (
    <DashboardLayout>
      <Head>
        <title>{fileName} — {slug} — Mission Control</title>
      </Head>

      {/* Breadcrumb path */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
        <span>brand</span>
        <span>/</span>
        <span>{slug}</span>
        {docPath.split("/").map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <span>/</span>
            <span className={i === docPath.split("/").length - 1 ? "text-foreground font-medium" : ""}>
              {part}
            </span>
          </span>
        ))}
      </div>

      {isLoading && (
        <div className="rounded-lg border-[3px] border-ink bg-card p-8 shadow-comic text-center">
          <p className="text-muted-foreground">Cargando documento...</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border-[3px] border-destructive bg-destructive/10 p-8 text-center">
          <p className="text-destructive font-semibold">Documento no encontrado</p>
          <p className="text-sm text-muted-foreground mt-2">{fullPath}</p>
        </div>
      )}

      {content && (
        <div className="rounded-lg border-[3px] border-ink bg-card p-8 shadow-comic">
          <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-heading prose-headings:text-navy prose-a:text-rust">
            <ReactMarkdown>{content}</ReactMarkdown>
          </article>
        </div>
      )}
    </DashboardLayout>
  );
}
