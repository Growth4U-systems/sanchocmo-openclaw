/**
 * Selector de cuenta remitente de Unipile (SAN-480).
 *
 * Pedido de Martín: "el DM sale desde la cuenta que esté conectada de Unipile
 * y tal vez deberíamos tener un selector dentro de Sancho para elegir con qué
 * cuenta [se envía]" — hoy: una cuenta de Instagram y una de LinkedIn.
 *
 * Componente presentacional: recibe cuentas + selección y notifica cambios.
 * Los datos vienen de `GET /api/partnerships/sender-accounts` y la selección
 * persiste por tenant vía `PUT` (brand/{slug}/outreach/settings.json) — el
 * wiring vive en `partnerships-view.tsx`. Si no hay cuentas configuradas no
 * renderiza nada (fallback `configured:false` sin romper la UI).
 */

import { cn } from "@/lib/utils";
import type {
  SenderAccount,
  SenderAccountProvider,
  SenderAccountStatus,
} from "@/lib/partnerships/sender-accounts";

export function senderAccountIcon(provider: SenderAccountProvider): string {
  return provider === "instagram" ? "📸" : "💼";
}

export function senderAccountProviderLabel(
  provider: SenderAccountProvider,
): string {
  return provider === "instagram" ? "Instagram" : "LinkedIn";
}

export function senderAccountStatusLabel(status: SenderAccountStatus): string {
  if (status === "connected") return "conectada";
  if (status === "disconnected") return "desconectada";
  return "estado desconocido";
}

export function senderAccountOptionLabel(account: SenderAccount): string {
  return `${senderAccountIcon(account.provider)} ${account.label} · ${senderAccountProviderLabel(account.provider)}${
    account.status === "connected"
      ? ""
      : ` · ${senderAccountStatusLabel(account.status)}`
  }`;
}

export interface SenderAccountSelectProps {
  accounts: SenderAccount[];
  /** null = sin preferencia: Yalc usa su cuenta por defecto. */
  selectedAccountId: string | null;
  onSelect: (accountId: string | null) => void;
  disabled?: boolean;
  className?: string;
}

export function SenderAccountSelect({
  accounts,
  selectedAccountId,
  onSelect,
  disabled,
  className,
}: SenderAccountSelectProps) {
  if (accounts.length === 0) return null;

  const selected =
    accounts.find((account) => account.id === selectedAccountId) || null;

  return (
    <label
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground",
        className,
      )}
      title="Cuenta conectada de Unipile desde la que sale el DM"
      data-testid="sender-account-select"
    >
      <span aria-hidden>{selected ? senderAccountIcon(selected.provider) : "📤"}</span>
      <span>Enviar desde</span>
      <select
        value={selected ? selected.id : ""}
        disabled={disabled}
        onChange={(event) => onSelect(event.target.value || null)}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="sender-account-select-input"
      >
        <option value="">Cuenta por defecto</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {senderAccountOptionLabel(account)}
          </option>
        ))}
      </select>
      {selected && selected.status !== "connected" && (
        <span
          className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive"
          data-testid="sender-account-status-warning"
        >
          {senderAccountStatusLabel(selected.status)}
        </span>
      )}
    </label>
  );
}
