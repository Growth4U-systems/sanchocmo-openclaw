"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  TEMPLATE_VARIABLE_OPTIONS,
  extractTemplateVariableKeys,
  findInvalidTemplateExpressions,
  findUnsupportedTemplateFallbacks,
  findUnsupportedTemplateVariables,
  renderTemplateText,
} from "@/lib/partnerships/templates";
import type {
  TemplateRenderContext,
  TemplateStep,
  TemplateVariableOption,
} from "@/lib/partnerships/templates";
import type { PartnershipLead } from "@/lib/partnerships/types";

export interface EditorState {
  id: string | null; // null = nueva
  name: string;
  kind: "sequence" | "brief";
  type: "partnerships" | "b2b";
  description: string;
  steps: TemplateStep[];
}

export interface SequenceEditorProps {
  editor: EditorState;
  onChange: (next: EditorState) => void;
  onSave: () => void;
  saving: boolean;
  variables?: TemplateVariableOption[];
  variablesLoading?: boolean;
  variablesError?: string | null;
  previewLeads?: PartnershipLead[];
  previewLeadsLoading?: boolean;
  previewLeadsError?: string | null;
}

const EXAMPLE_PREVIEW_ID = "__catalog-example__";

type AuditStatus = "available" | "missing" | "unsupported";

interface VariableAuditRow {
  key: string;
  token: string;
  option: TemplateVariableOption | null;
  value: string | null;
  status: AuditStatus;
}

function sourceKindLabel(source: TemplateVariableOption["sourceKind"]): string {
  if (source === "scrapecreators") return "ScrapeCreators";
  if (source === "discovery-plan") return "Plan de discovery";
  return "Yalc";
}

function variableTestId(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function leadLabel(lead: PartnershipLead): string {
  const fullName = [lead.firstName, lead.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const identity =
    lead.handle?.trim() || fullName || lead.email?.trim() || lead.id;
  return lead.handle && fullName && fullName !== lead.handle
    ? `${lead.handle} · ${fullName}`
    : identity;
}

function contextForLead(lead: PartnershipLead): TemplateRenderContext {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  return {
    name: name || lead.handle || null,
    firstName: lead.firstName,
    lastName: lead.lastName,
    company: lead.company,
    handle: lead.handle,
    network: lead.network,
    followers: lead.followers,
    sector: lead.customVariables?.sector,
    qualityScore: lead.qualityScore,
    precio: lead.offeredPrice,
    customVariables: lead.customVariables,
  };
}

function exampleContext(
  variables: readonly TemplateVariableOption[],
): TemplateRenderContext {
  const customVariables = Object.fromEntries(
    variables
      .filter((variable) => variable.source === "custom")
      .map((variable) => [variable.key, variable.example]),
  );
  return {
    name: "Lucía Martínez",
    firstName: "Lucía",
    lastName: "Martínez",
    company: "Estudio Lucía",
    handle: "@luciamartinez",
    network: "Instagram",
    followers: 84_000,
    sector: customVariables.sector || "salud capilar · divulgación",
    qualityScore: 87,
    precio: 1_500,
    customVariables,
  };
}

function variableMap(
  variables: readonly TemplateVariableOption[],
): Map<string, TemplateVariableOption> {
  const map = new Map<string, TemplateVariableOption>();
  for (const variable of variables) {
    map.set(variable.key.toLowerCase(), variable);
    for (const alias of variable.aliases || [])
      map.set(alias.toLowerCase(), variable);
  }
  return map;
}

export function SequenceEditor({
  editor,
  onChange,
  onSave,
  saving,
  variables,
  variablesLoading = false,
  variablesError = null,
  previewLeads = [],
  previewLeadsLoading = false,
  previewLeadsError = null,
}: SequenceEditorProps) {
  const lastTextarea = useRef<HTMLTextAreaElement | null>(null);
  const firstTemplateField = useRef<HTMLTextAreaElement | null>(null);
  const lastTemplateField = useRef<
    HTMLInputElement | HTMLTextAreaElement | null
  >(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLeadId, setPreviewLeadId] = useState(EXAMPLE_PREVIEW_ID);

  const variableOptions = useMemo(
    () =>
      (variables?.length ? variables : TEMPLATE_VARIABLE_OPTIONS).filter(
        (variable) =>
          !variable.campaignTypes?.length ||
          variable.campaignTypes.includes(editor.type),
      ),
    [editor.type, variables],
  );
  const optionsByKey = useMemo(
    () => variableMap(variableOptions),
    [variableOptions],
  );
  const unsupportedVariables = useMemo(
    () => findUnsupportedTemplateVariables(editor.steps),
    [editor.steps],
  );
  const invalidExpressions = useMemo(
    () => findInvalidTemplateExpressions(editor.steps),
    [editor.steps],
  );
  const unsupportedFallbacks = useMemo(
    () => findUnsupportedTemplateFallbacks(editor.steps),
    [editor.steps],
  );
  const usedVariableKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const step of editor.steps) {
      for (const text of [step.subject, step.body]) {
        if (!text) continue;
        for (const key of extractTemplateVariableKeys(text)) keys.add(key);
      }
    }
    return [...keys].sort();
  }, [editor.steps]);

  const selectedPreviewLead = useMemo(
    () => previewLeads.find((lead) => lead.id === previewLeadId) || null,
    [previewLeadId, previewLeads],
  );
  const previewContext = useMemo(
    () =>
      selectedPreviewLead
        ? contextForLead(selectedPreviewLead)
        : exampleContext(variableOptions),
    [selectedPreviewLead, variableOptions],
  );
  const renderedSteps = useMemo(
    () =>
      editor.steps.map((step) => ({
        ...step,
        subject: step.subject
          ? renderTemplateText(step.subject, previewContext)
          : null,
        body: renderTemplateText(step.body, previewContext),
      })),
    [editor.steps, previewContext],
  );
  const variableAudit = useMemo<VariableAuditRow[]>(
    () =>
      usedVariableKeys.map((key) => {
        const option = optionsByKey.get(key) || null;
        const token = `{{${key}}}`;
        if (!option)
          return {
            key,
            token,
            option: null,
            value: null,
            status: "unsupported",
          };
        const rendered = renderTemplateText(token, previewContext);
        const available = rendered !== token && rendered.trim().length > 0;
        return {
          key,
          token,
          option,
          value: available ? rendered : null,
          status: available ? "available" : "missing",
        };
      }),
    [optionsByKey, previewContext, usedVariableKeys],
  );
  const missingPreviewVariables = variableAudit.filter(
    (row) => row.status === "missing",
  );

  useEffect(() => {
    if (
      previewLeadId !== EXAMPLE_PREVIEW_ID &&
      !previewLeads.some((lead) => lead.id === previewLeadId)
    ) {
      setPreviewLeadId(EXAMPLE_PREVIEW_ID);
    }
  }, [previewLeadId, previewLeads]);

  function patchStep(index: number, patch: Partial<TemplateStep>) {
    onChange({
      ...editor,
      steps: editor.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...patch } : step,
      ),
    });
  }

  function applyToBody(
    transform: (
      value: string,
      start: number,
      end: number,
    ) => { value: string; caret: number },
  ) {
    const textarea = lastTextarea.current;
    if (!textarea) return;
    const index = Number(textarea.dataset.step ?? -1);
    if (!Number.isInteger(index) || index < 0 || index >= editor.steps.length)
      return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const { value, caret } = transform(textarea.value, start, end);
    patchStep(index, { body: value });
    requestAnimationFrame(() => {
      if (!textarea.isConnected) return;
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = caret;
    });
  }

  function insertText(text: string) {
    applyToBody((value, start, end) => ({
      value: value.slice(0, start) + text + value.slice(end),
      caret: start + text.length,
    }));
  }

  function wrapSelection(token: string) {
    applyToBody((value, start, end) => {
      const selection = value.slice(start, end);
      const wrapped = `${token}${selection}${token}`;
      return {
        value: value.slice(0, start) + wrapped + value.slice(end),
        caret: start + wrapped.length,
      };
    });
  }

  function insertVariable(variable: TemplateVariableOption) {
    const field = lastTemplateField.current || firstTemplateField.current;
    if (!field) return;
    const index = Number(field.dataset.step ?? -1);
    if (!Number.isInteger(index) || index < 0 || index >= editor.steps.length)
      return;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    const value =
      field.value.slice(0, start) + variable.token + field.value.slice(end);
    const caret = start + variable.token.length;
    patchStep(
      index,
      field.dataset.field === "subject" ? { subject: value } : { body: value },
    );
    requestAnimationFrame(() => {
      if (!field.isConnected) return;
      field.focus();
      field.selectionStart = field.selectionEnd = caret;
    });
  }

  return (
    <div className="space-y-4 p-1" data-testid="template-editor">
      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">
          Nombre
        </span>
        <input
          value={editor.name}
          onChange={(event) =>
            onChange({ ...editor, name: event.target.value })
          }
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold focus:border-rust focus:outline-none"
          data-testid="editor-name"
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">
            Tipo de campaña
          </span>
          <select
            value={editor.type}
            onChange={(event) =>
              onChange({
                ...editor,
                type: event.target.value === "b2b" ? "b2b" : "partnerships",
              })
            }
            className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-rust focus:outline-none"
            data-testid="editor-type"
          >
            <option value="partnerships">Partnerships</option>
            <option value="b2b">B2B</option>
          </select>
        </label>
        {!editor.id && (
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">
              Clase
            </span>
            <select
              value={editor.kind}
              onChange={(event) =>
                onChange({
                  ...editor,
                  kind: event.target.value === "brief" ? "brief" : "sequence",
                })
              }
              className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-rust focus:outline-none"
            >
              <option value="sequence">Secuencia</option>
              <option value="brief">Brief</option>
            </select>
          </label>
        )}
      </div>

      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">
          Descripción (una línea)
        </span>
        <input
          value={editor.description}
          onChange={(event) =>
            onChange({ ...editor, description: event.target.value })
          }
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-rust focus:outline-none"
        />
      </label>

      <section aria-labelledby="template-variables-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3
              id="template-variables-title"
              className="text-xs font-semibold text-foreground"
            >
              Variables disponibles
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Solo campos literales persistidos; no se generan datos para
              completar variables.
            </p>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {variableOptions.length} campos
          </span>
        </div>
        <div
          className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border bg-background"
          data-testid="template-variable-list"
        >
          {variableOptions.map((variable) => (
            <div
              key={variable.key}
              className="grid gap-2 border-b border-border/70 px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto]"
              data-testid={`template-variable-${variableTestId(variable.key)}`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs font-semibold text-foreground">
                    {variable.label}
                  </span>
                  <code className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] text-rust">
                    {variable.token}
                  </code>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {sourceKindLabel(variable.sourceKind)}
                  </span>
                </div>
                <p className="mt-1 break-words text-[10px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground/80">
                    Origen:
                  </span>{" "}
                  <code>{variable.sourcePath}</code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => insertVariable(variable)}
                className="self-center rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-rust transition-colors hover:border-rust hover:bg-rust/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40"
                aria-label={`Insertar ${variable.token}`}
                title={`Insertar ${variable.token} en el último asunto o cuerpo editado`}
                data-testid={`insert-variable-${variableTestId(variable.key)}`}
              >
                Insertar
              </button>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          La variable se inserta en el último asunto o cuerpo donde dejaste el
          cursor.
        </p>
        {variablesLoading && (
          <p className="mt-1 text-[11px] text-muted-foreground" role="status">
            Cargando catálogo de Outreach…
          </p>
        )}
        {variablesError && (
          <p className="mt-1 text-[11px] text-amber-700" role="alert">
            Catálogo de Outreach no disponible; usando el catálogo local.
          </p>
        )}
        {unsupportedVariables.length > 0 && (
          <div
            className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] leading-relaxed text-destructive"
            role="alert"
            data-testid="unsupported-template-variables"
          >
            <b>No disponibles:</b>{" "}
            {unsupportedVariables.map((key) => `{{${key}}}`).join(", ")}.
            Reemplázalas por variables del catálogo antes de guardar.
          </div>
        )}
        {invalidExpressions.length > 0 && (
          <div
            className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] leading-relaxed text-destructive"
            role="alert"
            data-testid="invalid-template-expressions"
          >
            <b>Sintaxis no válida:</b> {invalidExpressions.join(", ")}. Inserta
            las variables desde el catálogo.
          </div>
        )}
        {unsupportedFallbacks.length > 0 && (
          <div
            className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] leading-relaxed text-destructive"
            role="alert"
            data-testid="unsupported-template-fallbacks"
          >
            <b>Fallbacks no compatibles con el envío:</b>{" "}
            {unsupportedFallbacks.map((key) => `{{${key} | "…"}}`).join(", ")}.
            Usa tokens simples del catálogo.
          </div>
        )}
      </section>

      {editor.steps.map((step, index) => (
        <div key={index}>
          {index > 0 && (
            <div className="mb-2 flex items-center gap-2 pl-3 text-xs text-muted-foreground">
              <span className="w-7 border-b border-dashed border-border" /> ⏱
              espera
              <input
                type="number"
                min={1}
                max={30}
                value={step.delayDays}
                onChange={(event) => {
                  const delayDays = Math.max(
                    1,
                    parseInt(event.target.value, 10) || 1,
                  );
                  patchStep(index, { delayDays });
                }}
                className="w-14 rounded-md border border-border bg-background px-2 py-0.5 text-center text-sm focus:border-rust focus:outline-none"
                aria-label={`Espera del paso ${index + 1} en días`}
                data-testid={`step-delay-${index}`}
              />
              días{" "}
              <span className="flex-1 border-b border-dashed border-border" />
            </div>
          )}
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rust font-heading text-xs text-white">
                {index + 1}
              </span>
              <input
                value={step.title}
                onChange={(event) =>
                  patchStep(index, { title: event.target.value })
                }
                className="w-32 rounded border border-border bg-background px-2 py-0.5 text-xs font-semibold focus:border-rust focus:outline-none"
                title="Título del paso"
                aria-label={`Título del paso ${index + 1}`}
              />
              {editor.kind === "sequence" && (
                <input
                  value={step.subject ?? ""}
                  placeholder="Asunto…"
                  data-step={index}
                  data-field="subject"
                  onFocus={(event) => {
                    lastTemplateField.current = event.currentTarget;
                  }}
                  onChange={(event) =>
                    patchStep(index, { subject: event.target.value })
                  }
                  className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs focus:border-rust focus:outline-none"
                  aria-label={`Asunto del paso ${index + 1}`}
                  data-testid={`step-subject-${index}`}
                />
              )}
              {editor.kind === "sequence" && editor.steps.length > 1 && (
                <button
                  type="button"
                  title="Eliminar paso"
                  aria-label={`Eliminar paso ${index + 1}`}
                  onClick={() =>
                    onChange({
                      ...editor,
                      steps: editor.steps.filter(
                        (_, stepIndex) => stepIndex !== index,
                      ),
                    })
                  }
                  className="grid h-6 w-6 place-items-center rounded-md border border-border bg-transparent text-xs text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="mb-1 flex gap-1">
              <button
                type="button"
                title="Negrita"
                aria-label="Negrita"
                onClick={() => wrapSelection("**")}
                className="grid h-6 w-6 place-items-center rounded border border-border bg-muted/40 text-xs font-bold hover:bg-muted"
              >
                B
              </button>
              <button
                type="button"
                title="Cursiva"
                aria-label="Cursiva"
                onClick={() => wrapSelection("*")}
                className="grid h-6 w-6 place-items-center rounded border border-border bg-muted/40 text-xs italic hover:bg-muted"
              >
                i
              </button>
              <button
                type="button"
                title="Enlace"
                aria-label="Insertar enlace"
                onClick={() => insertText("[texto](https://)")}
                className="grid h-6 w-6 place-items-center rounded border border-border bg-muted/40 text-xs hover:bg-muted"
              >
                🔗
              </button>
              <button
                type="button"
                title="Lista"
                aria-label="Insertar elemento de lista"
                onClick={() => insertText("\n- ")}
                className="grid h-6 w-6 place-items-center rounded border border-border bg-muted/40 text-xs hover:bg-muted"
              >
                •
              </button>
            </div>
            <textarea
              ref={(element) => {
                if (index === 0) firstTemplateField.current = element;
              }}
              value={step.body}
              data-step={index}
              data-field="body"
              onFocus={(event) => {
                lastTextarea.current = event.currentTarget;
                lastTemplateField.current = event.currentTarget;
              }}
              onChange={(event) =>
                patchStep(index, { body: event.target.value })
              }
              className="min-h-[110px] w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:border-rust focus:outline-none"
              aria-label={`Cuerpo del paso ${index + 1}`}
              data-testid={`step-body-${index}`}
            />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        {editor.kind === "sequence" && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...editor,
                steps: [
                  ...editor.steps,
                  {
                    title: `Paso ${editor.steps.length + 1}`,
                    delayDays: 3,
                    subject: "Re: seguimiento",
                    body: "Hola {{handle}}, …",
                  },
                ],
              })
            }
            className="rounded-lg border-2 border-border bg-background px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-muted"
            data-testid="add-step"
          >
            ＋ Añadir paso
          </button>
        )}
        <button
          type="button"
          onClick={() => setPreviewOpen((open) => !open)}
          className="rounded-lg border-2 border-border bg-background px-3 py-1.5 text-sm font-semibold transition-colors hover:border-rust/60 hover:bg-rust/5"
          aria-expanded={previewOpen}
          aria-controls="template-preview-panel"
          data-testid="toggle-template-preview"
        >
          {previewOpen ? "Cerrar preview" : "Previsualizar"}
        </button>
        <button
          type="button"
          disabled={
            saving ||
            invalidExpressions.length > 0 ||
            unsupportedVariables.length > 0 ||
            unsupportedFallbacks.length > 0
          }
          onClick={onSave}
          className="rounded-lg border-2 border-rust bg-rust px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-rust/90 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="save-template"
          title={
            invalidExpressions.length > 0
              ? "Corrige la sintaxis de variables antes de guardar"
              : unsupportedVariables.length > 0
                ? "Reemplaza las variables no disponibles antes de guardar"
                : unsupportedFallbacks.length > 0
                  ? "Usa tokens simples; el envío no admite fallbacks"
                  : undefined
          }
        >
          {saving ? "Guardando…" : "💾 Guardar"}
        </button>
      </div>

      {previewOpen && (
        <section
          id="template-preview-panel"
          className="space-y-4 rounded-xl border border-border bg-muted/20 p-4"
          aria-labelledby="template-preview-title"
          data-testid="template-preview"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3
                id="template-preview-title"
                className="text-sm font-semibold text-foreground"
              >
                Mensaje final por lead
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Render local con los valores persistidos; los faltantes quedan
                visibles.
              </p>
            </div>
            <label className="min-w-[240px] flex-1 sm:max-w-[320px]">
              <span className="block text-[11px] font-semibold text-muted-foreground">
                Datos para el preview
              </span>
              <select
                value={
                  selectedPreviewLead
                    ? selectedPreviewLead.id
                    : EXAMPLE_PREVIEW_ID
                }
                onChange={(event) => setPreviewLeadId(event.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-rust focus:outline-none"
                data-testid="template-preview-lead-select"
              >
                <option value={EXAMPLE_PREVIEW_ID}>Ejemplo del catálogo</option>
                {previewLeads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {leadLabel(lead)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {previewLeadsLoading && (
            <p className="text-[11px] text-muted-foreground" role="status">
              Cargando leads reales… El ejemplo sigue disponible.
            </p>
          )}
          {previewLeadsError && (
            <p
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900"
              role="alert"
            >
              No se pudieron cargar leads reales: {previewLeadsError}. Puedes
              revisar el ejemplo del catálogo.
            </p>
          )}
          {unsupportedVariables.length > 0 && (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              El preview contiene variables no disponibles:{" "}
              <b>
                {unsupportedVariables.map((key) => `{{${key}}}`).join(", ")}
              </b>
              .
            </div>
          )}
          {invalidExpressions.length > 0 && (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              El preview contiene sintaxis no válida:{" "}
              {invalidExpressions.join(", ")}.
            </div>
          )}
          {unsupportedFallbacks.length > 0 && (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              El preview local no garantiza fallbacks. Sustituye{" "}
              <b>
                {unsupportedFallbacks
                  .map((key) => `{{${key} | "…"}}`)
                  .join(", ")}
              </b>{" "}
              por tokens simples antes de guardar.
            </div>
          )}
          {selectedPreviewLead && missingPreviewVariables.length > 0 && (
            <div
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              role="status"
            >
              Este lead no tiene valor para:{" "}
              <b>
                {missingPreviewVariables.map((row) => row.token).join(", ")}
              </b>
              .
            </div>
          )}

          <div className="space-y-3" data-testid="template-preview-steps">
            {renderedSteps.map((step, index) => (
              <article
                key={index}
                className="overflow-hidden rounded-lg border border-border bg-background"
                data-testid={`template-preview-step-${index}`}
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-rust text-[10px] font-semibold text-white">
                    {index + 1}
                  </span>
                  <b className="text-xs text-foreground">{step.title}</b>
                  {index > 0 && step.delayDays > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      espera {step.delayDays}{" "}
                      {step.delayDays === 1 ? "día" : "días"}
                    </span>
                  )}
                </div>
                <div className="space-y-2 px-3 py-3">
                  {step.subject && (
                    <div
                      className="rounded border border-border bg-muted/20 px-2 py-1.5 text-xs font-semibold text-foreground"
                      data-testid={`template-preview-subject-${index}`}
                    >
                      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Asunto
                      </span>
                      {step.subject}
                    </div>
                  )}
                  <div
                    className="whitespace-pre-wrap text-sm leading-relaxed text-foreground"
                    data-testid={`template-preview-body-${index}`}
                  >
                    {step.body}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-background">
            <table
              className="w-full min-w-[520px] text-left text-[11px]"
              data-testid="template-variable-audit"
            >
              <caption className="border-b border-border px-3 py-2 text-left text-xs font-semibold text-foreground">
                Variables usadas en esta plantilla
              </caption>
              <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Variable
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Valor
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Origen
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {variableAudit.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-4 text-center text-muted-foreground"
                    >
                      Esta plantilla no usa variables.
                    </td>
                  </tr>
                )}
                {variableAudit.map((row) => (
                  <tr
                    key={row.key}
                    className="border-t border-border/70 align-top"
                    data-testid={`template-variable-audit-${variableTestId(row.key)}`}
                  >
                    <td className="px-3 py-2">
                      <code className="text-rust">{row.token}</code>
                    </td>
                    <td className="max-w-[180px] break-words px-3 py-2 text-foreground">
                      {row.value || "—"}
                    </td>
                    <td className="max-w-[230px] break-words px-3 py-2 text-muted-foreground">
                      {row.option ? (
                        <>
                          <span className="font-semibold text-foreground/80">
                            {sourceKindLabel(row.option.sourceKind)}
                          </span>
                          <br />
                          <code>{row.option.sourcePath}</code>
                        </>
                      ) : (
                        "No existe en el catálogo de Outreach"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          row.status === "available"
                            ? "font-semibold text-sage"
                            : row.status === "missing"
                              ? "font-semibold text-amber-700"
                              : "font-semibold text-destructive"
                        }
                      >
                        {row.status === "available"
                          ? "Disponible"
                          : row.status === "missing"
                            ? "Falta en este lead"
                            : "No disponible"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
