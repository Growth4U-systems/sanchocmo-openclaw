#!/usr/bin/env python3
"""
Usage Monitor — alerta de "extra usage" de la suscripción Claude (Anthropic).

Por qué existe: los agentes del gateway corren sobre la suscripción Claude Max
(OAuth, vía CLAUDE_CODE_OAUTH_TOKEN). Esa suscripción tiene topes (ventana de 5h
y semanal de 7d) y, al agotarse, las requests se rechazan ("out of extra usage").
Si no avisamos antes, el sistema se corta sin previo aviso. Este monitor hace un
probe mínimo a la API, lee los headers `anthropic-ratelimit-unified-*` (que traen
la utilización exacta de cada ventana) y avisa por Discord ANTES de toparse.

Mecanismo: un único request de 1 token a /v1/messages con el token OAuth +
`anthropic-beta: oauth-2025-04-20`. La respuesta (incluso 429) trae:
  anthropic-ratelimit-unified-status        allowed | allowed_warning | rejected
  anthropic-ratelimit-unified-5h-utilization   0.0-1.0  (ventana de 5 horas)
  anthropic-ratelimit-unified-7d-utilization   0.0-1.0  (ventana semanal)
  anthropic-ratelimit-unified-5h-reset / -7d-reset   epoch de reset
  anthropic-ratelimit-unified-overage-status   estado del overage (créditos)

Niveles: ok → warning (>= WARN) → critical (>= CRIT o allowed_warning) →
exhausted (rejected / HTTP 429) → auth_error (HTTP 401/403, token roto).

Dedupe: estado en memory/usage-monitor-state.json. Sólo postea al escalar de
nivel, al re-confirmar un nivel de alerta cada USAGE_REALERT_SECONDS, o al
recuperar (volver a ok tras una alerta).

Run:
  python3 scripts/usage-monitor.py                 # un check + alerta si aplica
  python3 scripts/usage-monitor.py --print         # sólo imprime estado, no alerta
  python3 scripts/usage-monitor.py --dry-run        # evalúa y muestra, no postea
  python3 scripts/usage-monitor.py --force          # postea ignorando el dedupe

Env:
  CLAUDE_CODE_OAUTH_TOKEN   (requerido) token OAuth de la suscripción
  DISCORD_WEBHOOK_CERVANTES (requerido para postear) webhook de #cervantes-admin
  USAGE_WARN_THRESHOLD      umbral warning (default 0.80)
  USAGE_CRIT_THRESHOLD      umbral critical (default 0.92)
  USAGE_REALERT_SECONDS     re-aviso mínimo entre alertas del mismo nivel (default 21600 = 6h)
  USAGE_PROBE_MODEL         modelo del probe (default claude-haiku-4-5-20251001)
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

OPENCLAW_HOME = Path(os.environ.get("OPENCLAW_HOME", str(Path.home() / ".openclaw")))
WORKSPACE = OPENCLAW_HOME / "workspace-sancho"
STATE_FILE = WORKSPACE / "memory" / "usage-monitor-state.json"

API_URL = "https://api.anthropic.com/v1/messages"
PROBE_MODEL = os.environ.get("USAGE_PROBE_MODEL", "claude-haiku-4-5-20251001")
WARN = float(os.environ.get("USAGE_WARN_THRESHOLD", "0.80"))
CRIT = float(os.environ.get("USAGE_CRIT_THRESHOLD", "0.92"))
REALERT_SECONDS = int(os.environ.get("USAGE_REALERT_SECONDS", str(6 * 3600)))

# Severity ranking so we can detect escalation vs. de-escalation.
SEVERITY = {"ok": 0, "warning": 1, "critical": 2, "exhausted": 3, "auth_error": 3}


def probe():
    """Make a 1-token call and return (http_status, headers_dict_lowercased).

    Reads rate-limit headers even on 429/4xx (urllib HTTPError carries .headers).
    Returns (None, {}) on network failure so the caller degrades gracefully.
    """
    token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN", "").strip()
    if not token:
        return ("no_token", {})
    body = json.dumps({
        "model": PROBE_MODEL,
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "ping"}],
    }).encode("utf-8")
    req = urllib.request.Request(API_URL, data=body, method="POST")
    req.add_header("authorization", f"Bearer {token}")
    req.add_header("anthropic-version", "2023-06-01")
    req.add_header("anthropic-beta", "oauth-2025-04-20")
    req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return (resp.status, {k.lower(): v for k, v in resp.headers.items()})
    except urllib.error.HTTPError as e:
        # 429 (rejected) / 401 (bad token) still carry the rate-limit headers.
        return (e.code, {k.lower(): v for k, v in (e.headers or {}).items()})
    except Exception as e:  # network/timeout — don't crash the loop
        return ("error", {"_error": str(e)})


def _f(headers, key, default=0.0):
    try:
        return float(headers.get(key, default))
    except (TypeError, ValueError):
        return default


def evaluate(status, headers):
    """Map (http status, headers) → a structured verdict dict."""
    unified = (headers.get("anthropic-ratelimit-unified-status") or "").lower()
    util_5h = _f(headers, "anthropic-ratelimit-unified-5h-utilization")
    util_7d = _f(headers, "anthropic-ratelimit-unified-7d-utilization")
    overage = (headers.get("anthropic-ratelimit-unified-overage-status") or "").lower()
    overage_reason = headers.get("anthropic-ratelimit-unified-overage-disabled-reason") or ""

    util = max(util_5h, util_7d)
    window = "7d" if util_7d >= util_5h else "5h"
    reset_epoch = _f(headers, f"anthropic-ratelimit-unified-{window}-reset")

    if status in ("no_token",):
        level = "auth_error"
    elif status in (401, 403):
        level = "auth_error"
    elif status == 429 or unified == "rejected":
        level = "exhausted"
    elif status == "error":
        # Network failure: report but don't escalate to a usage alert.
        level = "probe_error"
    elif unified == "allowed_warning" or util >= CRIT:
        level = "critical"
    elif util >= WARN:
        level = "warning"
    else:
        level = "ok"

    return {
        "level": level,
        "http_status": status,
        "unified_status": unified,
        "util": round(util, 4),
        "util_5h": round(util_5h, 4),
        "util_7d": round(util_7d, 4),
        "dominant_window": window,
        "reset_epoch": int(reset_epoch) if reset_epoch else 0,
        "overage_status": overage,
        "overage_reason": overage_reason,
        "error": headers.get("_error", ""),
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def _reset_human(epoch):
    if not epoch:
        return "—"
    now = datetime.now(timezone.utc).timestamp()
    mins = max(0, int((epoch - now) // 60))
    h, m = divmod(mins, 60)
    when = datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return f"{when} (en {h}h {m}m)"


def format_message(v):
    """Build (emoji, title, body) for Discord."""
    util_pct = f"{v['util'] * 100:.0f}%"
    win = "semanal (7d)" if v["dominant_window"] == "7d" else "5h"
    reset = _reset_human(v["reset_epoch"])
    lines = [
        f"Ventana {win} al **{util_pct}** (5h {v['util_5h']*100:.0f}% · 7d {v['util_7d']*100:.0f}%).",
        f"Reset: {reset}.",
    ]
    if v["overage_status"] in ("rejected", "disabled"):
        reason = f" ({v['overage_reason']})" if v["overage_reason"] else ""
        lines.append(f"⚠️ Overage (créditos extra) deshabilitado{reason}: al 100% se **corta**, no hay colchón.")

    if v["level"] == "warning":
        return ("🟡", "Suscripción Claude: te estás quedando sin extra usage",
                "\n".join(lines) + "\n\nMargen bajando. Considerá bajar volumen o subir el tope de créditos.")
    if v["level"] == "critical":
        return ("🟠", "Suscripción Claude: extra usage casi agotado",
                "\n".join(lines) + "\n\nMuy cerca del tope. Acción recomendada ya.")
    if v["level"] == "exhausted":
        return ("🔴", "Suscripción Claude: SIN extra usage — requests rechazadas",
                "\n".join(lines) + "\n\nLos agentes en suscripción se están cortando. Subí el tope o esperá al reset.")
    if v["level"] == "auth_error":
        return ("🔴", "Suscripción Claude: token OAuth inválido",
                f"El probe devolvió `{v['http_status']}`. El CLAUDE_CODE_OAUTH_TOKEN no autentica — re-generar con `claude setup-token` (cuenta accounts@growth4u.io).")
    if v["level"] == "ok":
        return ("🟢", "Suscripción Claude: extra usage recuperado",
                "\n".join(lines))
    return ("⚪", "Suscripción Claude: probe sin datos",
            f"No se pudo medir el uso: `{v.get('error') or v['http_status']}`.")


def post_discord(emoji, title, body):
    webhook = os.environ.get("DISCORD_WEBHOOK_CERVANTES", "").strip()
    if not webhook:
        print("[usage-monitor] DISCORD_WEBHOOK_CERVANTES not set, skipping post", file=sys.stderr)
        return False
    content = f"{emoji} **{title}**\n\n{body}"
    data = json.dumps({"content": content}).encode("utf-8")
    req = urllib.request.Request(webhook, data=data, method="POST")
    req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            ok = 200 <= resp.status < 300
            print(f"[usage-monitor] discord post {'OK' if ok else 'FAIL'} ({resp.status})")
            return ok
    except Exception as e:
        print(f"[usage-monitor] discord post failed: {e}", file=sys.stderr)
        return False


def load_state():
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {"last_level": "ok", "last_alert_epoch": 0}


def save_state(state):
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(state, indent=2) + "\n")
    except Exception as e:
        print(f"[usage-monitor] could not save state: {e}", file=sys.stderr)


def should_alert(level, state, now_epoch):
    """Decide whether to post, given the dedupe policy."""
    if level == "probe_error":
        return False  # transient; never alert
    last_level = state.get("last_level", "ok")
    last_epoch = state.get("last_alert_epoch", 0)
    sev, last_sev = SEVERITY.get(level, 0), SEVERITY.get(last_level, 0)

    if level == "ok":
        # Recovery: only announce if we were previously alerting.
        return last_sev > 0
    if sev > last_sev:
        return True  # escalation — alert immediately
    # Same/lower alert level still active → re-confirm at most every REALERT_SECONDS.
    return (now_epoch - last_epoch) >= REALERT_SECONDS


def main():
    ap = argparse.ArgumentParser(description="Monitor de extra usage de la suscripción Claude")
    ap.add_argument("--print", action="store_true", dest="print_only",
                    help="Imprime el estado actual (JSON) sin evaluar alertas")
    ap.add_argument("--dry-run", action="store_true", help="Evalúa y muestra, no postea ni guarda estado")
    ap.add_argument("--force", action="store_true", help="Postea ignorando el dedupe")
    args = ap.parse_args()

    status, headers = probe()
    verdict = evaluate(status, headers)

    if args.print_only:
        print(json.dumps(verdict, indent=2))
        return 0

    now_epoch = int(datetime.now(timezone.utc).timestamp())
    state = load_state()
    do_alert = args.force or should_alert(verdict["level"], state, now_epoch)

    print(f"[usage-monitor] level={verdict['level']} util={verdict['util']} "
          f"(5h={verdict['util_5h']} 7d={verdict['util_7d']}) status={verdict['http_status']} "
          f"alert={'yes' if do_alert else 'no'}")

    if do_alert:
        emoji, title, body = format_message(verdict)
        if args.dry_run:
            print(f"[usage-monitor] DRY-RUN would post:\n{emoji} {title}\n{body}")
        else:
            post_discord(emoji, title, body)

    if not args.dry_run:
        # Persist level always; bump alert timestamp only when we actually alerted.
        new_state = {
            "last_level": verdict["level"] if verdict["level"] != "probe_error" else state.get("last_level", "ok"),
            "last_alert_epoch": now_epoch if do_alert else state.get("last_alert_epoch", 0),
            "last_check": verdict,
        }
        save_state(new_state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
