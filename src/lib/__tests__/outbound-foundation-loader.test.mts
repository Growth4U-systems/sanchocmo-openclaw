import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "foundation-outbound-loader-"));
process.env.MC_WORKSPACE = workspace;

const { loadFoundationOutboundCatalog } = await import("../outreach/foundation-outbound-context");

after(() => fs.rmSync(workspace, { recursive: true, force: true }));

function write(relative: string, content: string) {
  const file = path.join(workspace, "brand", "acme", relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const validEcp = `# Positioning — ECP 1: "Sistema repetible"
> Generado: 2026-03-06 | Score: 79 | Wave 1
> Status: approved | v1

## JTBD Synthesis
| Campo | Contenido |
|---|---|
| Need | Quiero un sistema repetible. |
| Situation | Tácticas desconectadas. |
| Motivation | Un motor operable. |
| Outcome | Instalar un motor operable. |
| JTBD | Construir un sistema. |
| Alternatives | Agencia · In-house |

## Top Value Criteria para messaging
| # | Criteria | Imp. | G4U | Zone | Asset clave |
|---|---|---|---|---|---|
| 1 | System Transferability | 10 | 5 | Opp | A1 |

## Assets relevantes
| # | Asset | Criteria | Por qué importa en este ECP |
|---|---|---|---|
| A1 | Trust Engine | 1 | El sistema queda instalado. |

## Messaging Playbook
**UVP:** *"Para startups tech, instalamos un sistema de growth operable."*
| Cat. | Criteria | Asset | Versión Corta | Versión Landing |
|---|---|---|---|---|
| UVP Core | 1 | A1 | Un sistema que se queda. | Mensaje largo. |
`;

test("loads only allowlisted current ECP playbooks", () => {
  write("go-to-market/positioning/ecp1-sistema/ecp1-sistema.current.md", validEcp);
  write("go-to-market/positioning/ecp2-notas/notes.md", validEcp.replace(/ECP 1/, "ECP 2"));
  write("go-to-market/positioning/random/random.current.md", validEcp.replace(/ECP 1/, "ECP 9"));
  write("private/chat.md", validEcp.replace(/ECP 1/, "ECP 8"));

  const catalog = loadFoundationOutboundCatalog("acme");
  assert.equal(catalog.ecps.length, 1);
  assert.equal(catalog.ecps[0].brief.ecp.id, "ecp1");
  assert.deepEqual(catalog.ecps[0].brief.sources, [
    "go-to-market/positioning/ecp1-sistema/ecp1-sistema.current.md",
  ]);
});
