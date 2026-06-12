/**
 * /intake/[token] — Public, login-free intake form (SAN-17, v1.1).
 *
 * Conversational one-question-at-a-time flow styled with SanchoCMO's comic
 * brand (parchment + ink borders + offset shadows + halftone). No login.
 * getServerSideProps verifies the token, loads the client, and checks for an
 * existing submission. Answers post to /api/intake/[token]; files upload to
 * /api/intake/[token]/upload (R2). Backend is unchanged except the optional
 * `attachments` array carried in the final submit.
 */

import { useCallback, useRef, useState } from "react";
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { verifyIntakeToken } from "@/lib/intake-tokens";
import { loadClient } from "@/lib/data/clients";
import { loadIntakeSubmission } from "@/lib/intake/submissions";
import { INTAKE_QUESTIONS, type IntakeQuestion } from "@/lib/intake/questions";

interface PageProps {
  token: string | null;
  clientName: string | null;
  invalid: boolean;
  alreadySubmitted: boolean;
}

interface Attachment {
  url: string;
  filename: string;
  mimeType?: string;
  size?: number;
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

type Phase = "intro" | "question" | "uploads" | "review" | "done";

const QUESTIONS = INTAKE_QUESTIONS;

export default function IntakePage(props: PageProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [qIndex, setQIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const total = QUESTIONS.length;
  const set = (id: string, v: string) => setValues((p) => ({ ...p, [id]: v }));

  if (props.invalid) {
    return (
      <Shell>
        <Panel>
          <SanchoTag />
          <h1 className="mt-4 font-heading text-2xl text-navy">Link no válido</h1>
          <p className="mt-2 text-ink/70">
            Este enlace no es válido o ha caducado. Pídele uno nuevo a tu contacto en Growth4U.
          </p>
        </Panel>
      </Shell>
    );
  }

  if (phase === "done" || props.alreadySubmitted) {
    return (
      <Shell>
        <Panel>
          <SanchoTag />
          <h1 className="mt-4 font-heading text-3xl text-navy">¡Gracias! 🎉</h1>
          <p className="mt-3 text-lg text-ink/80">
            Tenemos lo que necesitamos para arrancar. Nos ponemos en marcha — te escribimos pronto.
          </p>
        </Panel>
      </Shell>
    );
  }

  // ---- intro ----
  if (phase === "intro") {
    return (
      <Shell>
        <Panel>
          <SanchoTag />
          <h1 className="mt-4 font-heading text-3xl leading-tight text-navy">
            Vamos a conocer {props.clientName}
          </h1>
          <Bubble>
            ¡Hola! Soy Sancho. Te voy a hacer unas preguntas cortas sobre tu negocio para
            arrancar con todo el contexto. No hace falta ser exhaustivo — lo que no sepas, lo
            saltas. Son ~{total} preguntas y al final puedes adjuntar lo que quieras.
          </Bubble>
          <div className="mt-6">
            <PrimaryButton onClick={() => setPhase("question")}>Empezar →</PrimaryButton>
          </div>
        </Panel>
      </Shell>
    );
  }

  // ---- uploads ----
  if (phase === "uploads") {
    return (
      <Shell>
        <Progress value={100} label="Casi" />
        <Panel>
          <SectionStamp text="Adjuntos" />
          <Bubble>
            ¿Tienes algo que ayude a entender el negocio? Deck, brand guidelines, web, métricas,
            lo que sea. Súbelo aquí (opcional).
          </Bubble>
          <UploadBox token={props.token!} attachments={attachments} setAttachments={setAttachments} />
          <Nav
            onBack={() => {
              setPhase("question");
              setQIndex(total - 1);
            }}
            onNext={() => setPhase("review")}
            nextLabel="Revisar →"
          />
        </Panel>
      </Shell>
    );
  }

  // ---- review ----
  if (phase === "review") {
    const answered = QUESTIONS.filter((qq) => values[qq.id]?.trim());
    return (
      <Shell>
        <Progress value={100} label="Último paso" />
        <Panel>
          <SectionStamp text="Repasa y envía" />
          <Bubble>Échale un ojo. Si algo no cuadra, vuelve atrás. Cuando esté, dale a enviar.</Bubble>
          <div className="mt-5 space-y-3">
            {answered.map((qq) => (
              <div key={qq.id} className="border-b-2 border-dashed border-ink/20 pb-3">
                <div className="text-xs font-bold uppercase tracking-wide text-rust">{qq.label}</div>
                <div className="mt-1 whitespace-pre-wrap text-ink/90">{values[qq.id]}</div>
              </div>
            ))}
            {attachments.length > 0 && (
              <div className="pt-1">
                <div className="text-xs font-bold uppercase tracking-wide text-rust">Adjuntos</div>
                <ul className="mt-1 list-inside list-disc text-ink/90">
                  {attachments.map((a) => (
                    <li key={a.url}>{a.filename}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {submitError && <p className="mt-4 font-bold text-destructive">{submitError}</p>}
          <Nav
            onBack={() => setPhase("uploads")}
            onNext={async () => {
              setSubmitting(true);
              setSubmitError(null);
              try {
                const res = await fetch(`/api/intake/${props.token}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ...values, attachments }),
                });
                if (!res.ok) {
                  const j = await res.json().catch(() => ({}));
                  throw new Error(j.error || "No se pudo enviar. Revisa los campos obligatorios.");
                }
                setPhase("done");
              } catch (err) {
                setSubmitError(err instanceof Error ? err.message : "Error al enviar");
              } finally {
                setSubmitting(false);
              }
            }}
            nextLabel={submitting ? "Enviando…" : "Enviar ✓"}
            nextDisabled={submitting}
          />
        </Panel>
      </Shell>
    );
  }

  // ---- question ----
  const q = QUESTIONS[qIndex];
  const value = values[q.id] || "";
  const isLast = qIndex === total - 1;

  const goNext = () => {
    if (q.required && !value.trim()) {
      setError("Esta es obligatoria 🙂");
      return;
    }
    setError(null);
    if (isLast) setPhase("uploads");
    else setQIndex((i) => i + 1);
  };
  const goBack = () => {
    setError(null);
    if (qIndex === 0) setPhase("intro");
    else setQIndex((i) => i - 1);
  };

  return (
    <Shell>
      <Progress value={Math.round((qIndex / total) * 100)} label={`${qIndex + 1} / ${total}`} />
      <Panel>
        <SectionStamp text={q.section} />
        <Bubble>
          {q.label}
          {q.required && <span className="text-rust"> *</span>}
        </Bubble>
        <QuestionInput q={q} value={value} onChange={(v) => set(q.id, v)} onEnter={goNext} error={error} />
        <Nav
          onBack={goBack}
          onNext={goNext}
          nextLabel={isLast ? "Continuar →" : "Siguiente →"}
          skip={!q.required && !value.trim() ? goNext : undefined}
        />
      </Panel>
    </Shell>
  );
}

/* ---------------- presentational pieces ---------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Head>
        <title>Formulario inicial · Sancho</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="relative min-h-screen bg-parchment font-sans text-ink">
        <div className="sc-halftone pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-10">
          {children}
        </div>
      </main>
    </>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-sc-lg border-[3px] border-ink bg-card p-6 shadow-comic sm:p-8">{children}</div>
  );
}

function SanchoTag() {
  return (
    <span className="inline-block -rotate-2 rounded-sc-pill border-2 border-ink bg-rust px-3 py-1 font-heading text-sm uppercase tracking-wide text-white shadow-comic-sm">
      ◗ Sancho
    </span>
  );
}

function SectionStamp({ text }: { text: string }) {
  return (
    <span className="inline-block -rotate-1 rounded-sc-pill border-2 border-ink bg-sage/20 px-3 py-1 font-heading text-xs uppercase tracking-wider text-navy">
      {text}
    </span>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-sc-lg rounded-tl-sm border-2 border-ink bg-white px-5 py-4 font-heading text-xl leading-snug text-navy shadow-comic-sm">
      {children}
    </div>
  );
}

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="mb-4 px-1">
      <div className="mb-1 flex justify-between font-heading text-xs uppercase tracking-wide text-ink/60">
        <span>◗ Sancho</span>
        <span>{label}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-sc-pill border-2 border-ink bg-card">
        <div
          className="h-full rounded-sc-pill bg-rust transition-all duration-300 ease-out"
          style={{ width: `${Math.max(4, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function QuestionInput({
  q,
  value,
  onChange,
  onEnter,
  error,
}: {
  q: IntakeQuestion;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  error: string | null;
}) {
  const base =
    "mt-5 w-full rounded-sc-md border-2 border-ink bg-white px-4 py-3 text-lg text-ink outline-none transition-shadow focus:shadow-comic-sm";
  return (
    <div>
      {q.type === "textarea" ? (
        <textarea
          autoFocus
          rows={4}
          className={base}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Escribe aquí…"
        />
      ) : (
        <input
          autoFocus
          type={q.type === "email" ? "email" : "text"}
          className={base}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
            }
          }}
          placeholder="Escribe aquí…"
        />
      )}
      {error && <p className="mt-2 font-bold text-destructive">{error}</p>}
    </div>
  );
}

function Nav({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  skip,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  skip?: () => void;
}) {
  return (
    <div className="mt-6 flex items-center justify-between">
      <button
        type="button"
        onClick={onBack}
        className="sc-pop-hover rounded-sc-md border-2 border-ink bg-card px-4 py-2 font-heading text-ink"
      >
        ← Atrás
      </button>
      <div className="flex items-center gap-3">
        {skip && (
          <button
            type="button"
            onClick={skip}
            className="font-heading text-sm text-ink/50 underline-offset-2 hover:underline"
          >
            Saltar
          </button>
        )}
        <PrimaryButton onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
        </PrimaryButton>
      </div>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="sc-pop-hover rounded-sc-md border-[3px] border-ink bg-rust px-6 py-3 font-heading text-base uppercase tracking-wide text-white shadow-comic disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function UploadBox({
  token,
  attachments,
  setAttachments,
}: {
  token: string;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setBusy(true);
      setErr(null);
      try {
        for (const file of Array.from(files)) {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch(`/api/intake/${token}/upload`, { method: "POST", body: fd });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || `No se pudo subir ${file.name}`);
          }
          const att = (await res.json()) as Attachment;
          setAttachments((prev) => [...prev, att]);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Error al subir el archivo");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [token, setAttachments],
  );

  return (
    <div className="mt-5">
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
        className="sc-pop-hover flex cursor-pointer flex-col items-center justify-center rounded-sc-md border-2 border-dashed border-ink bg-white px-4 py-8 text-center"
      >
        <span className="font-heading text-lg text-navy">
          {busy ? "Subiendo…" : "Arrastra archivos o haz clic"}
        </span>
        <span className="mt-1 text-sm text-ink/50">PDF, imágenes, docs · hasta 20 MB</span>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      </label>
      {err && <p className="mt-2 font-bold text-destructive">{err}</p>}
      {attachments.length > 0 && (
        <ul className="mt-4 space-y-2">
          {attachments.map((a, i) => (
            <li
              key={a.url}
              className="flex items-center justify-between rounded-sc-md border-2 border-ink bg-white px-3 py-2"
            >
              <span className="truncate font-heading text-sm text-ink">📎 {a.filename}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="ml-3 shrink-0 font-heading text-sm text-rust hover:underline"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
