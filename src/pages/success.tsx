import { useRouter } from "next/router";
import Head from "next/head";

export default function SuccessPage() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Payment Successful — Mission Control</title>
      </Head>
      <main className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="rounded-lg border-[3px] border-ink bg-card p-8 shadow-comic text-center max-w-md w-full">
          <div className="text-5xl mb-4">&#10003;</div>
          <h1 className="font-heading text-2xl text-navy mb-2">
            Payment Successful!
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Thank you for your subscription. Your account has been activated.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full px-4 py-3 bg-rust text-white rounded-lg font-semibold text-sm hover:opacity-90 border-2 border-ink shadow-comic-sm"
          >
            Go to Dashboard
          </button>
        </div>
      </main>
    </>
  );
}
