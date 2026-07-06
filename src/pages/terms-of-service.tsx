import Head from "next/head";
import Link from "next/link";

export default function TermsOfService() {
  return (
    <>
      <Head>
        <title>Terms of Service — Mission Control</title>
      </Head>
      <main className="min-h-screen bg-background py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Back to home
          </Link>

          <div className="rounded-lg border-[3px] border-ink bg-card p-8 md:p-12 shadow-comic mt-6">
            <h1 className="font-heading text-3xl text-navy mb-2">
              Terms of Service
            </h1>
            <p className="text-xs text-muted-foreground mb-8">
              Last updated: {new Date().toLocaleDateString()}
            </p>

            <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
              <section>
                <h2>1. Acceptance of Terms</h2>
                <p>
                  By using SanchoCMO Mission Control, you agree to these terms.
                  If you do not agree, do not use the service.
                </p>
              </section>

              <section>
                <h2>2. Description of Service</h2>
                <p>
                  Mission Control is a marketing operations platform that
                  provides project management, analytics, content strategy, and
                  AI-powered automation for businesses.
                </p>
              </section>

              <section>
                <h2>3. User Accounts</h2>
                <p>
                  You must provide accurate information when creating an account.
                  You are responsible for maintaining the security of your
                  credentials.
                </p>
              </section>

              <section>
                <h2>4. Subscription and Payment</h2>
                <p>
                  Subscriptions are billed through Polar. Fees are
                  non-refundable except as required by law. We may adjust pricing
                  with 30 days notice.
                </p>
              </section>

              <section>
                <h2>5. Intellectual Property</h2>
                <p>
                  You retain ownership of your content. We retain ownership of
                  the platform and its features.
                </p>
              </section>

              <section>
                <h2>6. Limitation of Liability</h2>
                <p>
                  The service is provided &quot;as is&quot; without warranties. We are not
                  liable for indirect or consequential damages.
                </p>
              </section>

              <section>
                <h2>7. Termination</h2>
                <p>
                  We may terminate your account for violation of these terms.
                  Upon termination, your right to use the service ceases.
                </p>
              </section>

              <section>
                <h2>8. Contact</h2>
                <p>
                  Questions? Email us at{" "}
                  <a href="mailto:hello@growth4u.io" className="text-rust">
                    hello@growth4u.io
                  </a>
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
