import Head from "next/head";
import Link from "next/link";

export default function PrivacyPolicy() {
  return (
    <>
      <Head>
        <title>Privacy Policy — Mission Control</title>
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
              Privacy Policy
            </h1>
            <p className="text-xs text-muted-foreground mb-8">
              Last updated: {new Date().toLocaleDateString()}
            </p>

            <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
              <section>
                <h2>1. Introduction</h2>
                <p>
                  Welcome to SanchoCMO Mission Control. We are committed to
                  protecting your personal information. This Privacy Policy
                  explains how we collect, use, and safeguard your data.
                </p>
              </section>

              <section>
                <h2>2. Information We Collect</h2>
                <ul>
                  <li>Name and email (via Google Sign-In)</li>
                  <li>Usage data and analytics</li>
                  <li>Payment information (processed by Polar)</li>
                </ul>
              </section>

              <section>
                <h2>3. How We Use Your Information</h2>
                <ul>
                  <li>Provide and maintain the service</li>
                  <li>Manage your account and subscription</li>
                  <li>Send important updates</li>
                  <li>Improve the service</li>
                </ul>
              </section>

              <section>
                <h2>4. Data Security</h2>
                <p>
                  We implement appropriate security measures to protect your
                  personal information. However, no method of transmission over
                  the Internet is 100% secure.
                </p>
              </section>

              <section>
                <h2>5. Your Rights</h2>
                <p>
                  You may request access, correction, or deletion of your
                  personal information at any time by contacting us.
                </p>
              </section>

              <section>
                <h2>6. Contact</h2>
                <p>
                  Questions about this policy? Email us at{" "}
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
