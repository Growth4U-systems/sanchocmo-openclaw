# Meeting Intelligence — Setup Growth4U

> Configurado: 2026-05-12 | Estado: ✅ Operativo

---

## Fuentes configuradas

### Google Drive
- **Carpeta:** Meet Recordings
- **ID:** `17iBf6P5n4hpqWUg4V9QKcqHwt2NYUFho`
- **Cuenta:** alfonso@growth4u.io
- **Filtro:** Archivos modificados ayer (daily run) | Preferir versión ES cuando existan EN+ES
- **Tipos:** .gdoc (Gemini Notes), .txt, .pdf
- **Estado:** ✅ Conectado

### Notion
- **DB:** Documents
- **ID:** `14b5dacf4f1480f2b4d4c0792b8a51ff`
- **URL:** https://www.notion.so/14b5dacf4f1480f2b4d4c0792b8a51ff
- **Integración:** openclaw-Alfonso
- **API version:** 2022-06-28 (usar esta — 2025-09-03 da 400 en POST/query)
- **Filtro:** `Type = "Meeting"`
- **Relaciones disponibles:** Clients, Tasks & Projects, 🤖 G4U Systems
- **Estado:** ✅ Conectado

### Slack
- **Workspace:** growth4u
- **Estado:** ✅ Conectado (desactivado en este run — activar si se quieren signals de canal)

---

## Routing

| Campo | Valor |
|---|---|
| Review owner | Alfonso Sainz de Baranda |
| Canal de entrega | Slack → Slackbot |
| Timezone | Europe/Madrid |
| Schedule | Daily 7:00 AM |

---

## Primer run — 2026-05-12

**Fuentes escaneadas:**
- Drive: 1 reunión (Sabrina Nittel / Alfonso — hoy 12 mayo)
- Notion: 3 reuniones con status=Ready (Xhype ×2, Gutendurance ×1)

**Output:** `brand/growth4u/intelligence/2026-05-12.json`

**Resultado:**
- 5 decisiones extraídas
- 7 action items con owners y deadlines
- 7 insights (pain points, trends, features, success)
- 5 quotes verbatim
- 5 riesgos / blockers / open questions

**Clientes tracked en este run:**
- Xhype (Sergi Candel) — cerrado, onboarding pendiente
- Gutendurance/Innatica (Lola Mares) — kickoff 15/5
- Decra (Sabrina Nittel) — prospect, follow-up 1ª semana junio

---

## Issues abiertos

1. ⚠️ **Notion API version:** usar siempre `2022-06-28` para queries POST. La versión `2025-09-03` devuelve 400 `invalid_request_url` en queries pero sí funciona en GET.
2. ℹ️ **Drive recordings:** los archivos .mp4/.mov NO se procesan (solo las Gemini Notes). Si se necesita extracción de audio, activar Whisper separately.
3. ℹ️ **Slack signals:** desactivado en la config base. Activar en `config.json` si se quiere captura de keywords del workspace.
