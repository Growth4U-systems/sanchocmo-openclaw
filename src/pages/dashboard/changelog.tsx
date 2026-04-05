import { useQuery } from "@tanstack/react-query";
import Head from "next/head";
import ReactMarkdown from "react-markdown";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";

export default function ChangelogPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["changelog"],
    queryFn: async () => {
      const res = await fetch("/api/chat/doc/CHANGELOG.md");
      if (!res.ok) return null;
      const d = await res.json();
      return d.content || d.text || "";
    },
    staleTime: 120_000,
  });

  return (
    <DashboardLayout>
      <Head><title>Changelog — Mission Control</title></Head>

      <h1 className="font-heading text-2xl text-navy mb-1">📜 Changelog</h1>
      <p className="text-sm text-muted-foreground mb-6">Historial de versiones</p>

      <ComicCard>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : data ? (
          <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-heading prose-headings:text-navy prose-a:text-rust">
            <ReactMarkdown>{data}</ReactMarkdown>
          </article>
        ) : (
          <p className="text-sm text-muted-foreground">No se encontró CHANGELOG.md</p>
        )}
      </ComicCard>
    </DashboardLayout>
  );
}
