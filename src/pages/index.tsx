import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import Head from "next/head";
import Link from "next/link";

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  // If authenticated, redirect to dashboard
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>Mission Control — SanchoCMO</title>
      </Head>
      <main className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <h1 className="font-heading text-4xl text-navy mb-2">
          Mission Control
        </h1>
        <p className="text-muted-foreground text-lg mb-8">SanchoCMO</p>
        <Link
          href="/auth/signin"
          className="px-6 py-3 bg-rust text-white rounded-lg font-semibold shadow-comic-sm hover:opacity-90 border-2 border-ink"
        >
          Iniciar sesión
        </Link>
      </main>
    </>
  );
}
