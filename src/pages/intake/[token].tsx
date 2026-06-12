/**
 * /intake/[token] — Public, login-free intake form (SAN-17).
 *
 * getServerSideProps verifies the token, loads the client, and checks for an
 * existing submission. The form posts to /api/intake/[token]. Mobile-first,
 * sectioned single page. No NextAuth session required (middleware lets non-
 * /dashboard routes through).
 */

import { useState } from "react";
import type { GetServerSideProps } from "next";
import { verifyIntakeToken } from "@/lib/intake-tokens";
import { loadClient } from "@/lib/data/clients";
import { loadIntakeSubmission } from "@/lib/intake/submissions";
import { INTAKE_QUESTIONS, INTAKE_SECTIONS, type IntakeQuestion } from "@/lib/intake/questions";

interface PageProps {
  token: string | null;
  clientName: string | null;
  invalid: boolean;
  alreadySubmitted: boolean;
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const raw = ctx.params?.token;
  const token = Array.isArray(raw) ? raw[0] : raw ?? null;
  const payload = token ? verifyIntakeToken(token) : null;
  if (!payload) {
    return { props: { token: null, clientName: null, invalid: true, alreadySubmitted: false } };
  }
  const client = loadClient(payload.slug);
  if (!client || client.active === false) {
    return { props: { token: null, clientName: null, invalid: true, alreadySubmitted: false } };
  }
  let alreadySubmitted = false;
  try {
    alreadySubmitted = (await loadIntakeSubmission(payload.slug)) !== null;
  } catch {
    alreadySubmitted = false; // DB unavailable → let them fill anyway
  }
  return {
    props: {
      token,
      clientName: client.name || payload.slug,
      invalid: false,
      alreadySubmitted,
    },
  };
};

export default function IntakePage(props: PageProps) {
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  if (props.invalid) {
    return (
      <Shell>
        <h1>Link no válido</h1>
        <p>Este enlace no es válido o ha caducado. Pide uno nuevo a tu contacto en Growth4U.</p>
      </Shell>
    );
  }

  if (done || props.alreadySubmitted) {
    return (
      <Shell>
        <h1>¡Gracias! 🎉</h1>
        <p>Hemos recibido tu formulario. Nos ponemos en marcha.</p>
      </Shell>
    );
  }

  const set = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/intake/${props.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "No se pudo enviar. Revisa los campos obligatorios.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <h1>Formulario inicial — {props.clientName}</h1>
      <p style={{ color: "#555" }}>
        Cuéntanos lo esencial de tu negocio para arrancar. No hace falta ser exhaustivo;
        lo que no sepas, déjalo en blanco.
      </p>
      <form onSubmit={onSubmit}>
        {/* Honeypot — hidden from humans */}
        <input
          type="text"
          name="company_url_confirm"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px" }}
          onChange={(e) => set("company_url_confirm", e.target.value)}
        />
        {INTAKE_SECTIONS.map((section) => (
          <fieldset key={section} style={{ border: "none", padding: 0, margin: "28px 0" }}>
            <legend style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{section}</legend>
            {INTAKE_QUESTIONS.filter((q) => q.section === section).map((q) => (
              <Field key={q.id} q={q} value={values[q.id] || ""} onChange={(v) => set(q.id, v)} />
            ))}
          </fieldset>
        ))}
        {error && <p style={{ color: "#c0392b" }}>{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "12px 20px",
            fontSize: 16,
            fontWeight: 600,
            background: "#111",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: submitting ? "default" : "pointer",
          }}
        >
          {submitting ? "Enviando…" : "Enviar"}
        </button>
      </form>
    </Shell>
  );
}

function Field({
  q,
  value,
  onChange,
}: {
  q: IntakeQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  if (q.pillar === "meta" && q.section !== "Contacto") return null;
  const label = (
    <label htmlFor={q.id} style={{ display: "block", fontWeight: 600, margin: "14px 0 4px" }}>
      {q.label} {q.required && <span style={{ color: "#c0392b" }}>*</span>}
    </label>
  );
  const common = {
    id: q.id,
    name: q.id,
    required: q.required,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    style: {
      width: "100%",
      padding: "10px 12px",
      fontSize: 15,
      border: "1px solid #ccc",
      borderRadius: 8,
      boxSizing: "border-box" as const,
    },
  };
  return (
    <div>
      {label}
      {q.type === "textarea" ? (
        <textarea {...common} rows={3} />
      ) : (
        <input {...common} type={q.type === "email" ? "email" : "text"} />
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "40px 20px 80px",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        lineHeight: 1.5,
      }}
    >
      {children}
    </main>
  );
}
