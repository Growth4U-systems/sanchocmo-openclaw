# Meeting Intelligence — Setup
**Client:** hospital-capilar  
**Configured:** 2026-05-12  
**Last verified:** 2026-05-12

---

## 1. APIs & Credentials

| API | Status | Notes |
|-----|--------|-------|
| Google Drive (gog) | ✅ Ready | account: alfonso@growth4u.io · auth: oauth · keyring: keychain |
| Notion | ❌ Not configured | `enabled: false` in config.json — no DB/page set |
| Slack | ❌ Not configured | `enabled: false` |
| Discord (publish) | ✅ Ready | channel `intelligence` (ID: 1475638253154603170) |

---

## 2. Google Drive

**Folder ID:** `17FpwSgL-XLAqaaH5-UccpADHkCFRcCHY`  
**Name:** Meeting notes folder  
**Access:** ✅ Confirmed — 14 files readable via gog

**Files in folder (2026-01-29 → 2026-03-18):**

| Doc ID | Name | Date | Status |
|--------|------|------|--------|
| `1kWhI6MslDemmN0U7vLe4VY6kb5DH5fOWjk5GW_a78E8` | Hospital Capilar - Growth4U | 2026-01-29 | ✅ processed |
| `1SFZUlMJfRuXQ_XBGSwNpghQcO6K1-Zx3` | HC Recording (mp4) | 2026-01-29 | ⏭️ skip (video) |
| `11B5kOingoKO1535iZN8htQjoDHfIgUVFbhWoeufMCqI` | HC Growth4U Sales Presentation | 2026-02-06 | ⚠️ in folder, not in meetings.json |
| `1knNkCRakIM2xAIM5NHKcXmxDPLSlhUp3p3MOnO0rFNU` | Heiver <> G4U Notes | 2026-02-07 | ✅ processed |
| `1KNr3WrXZTn1Badn9BFZiONVe6sd9WaAw` | Heiver Recording (mp4) | 2026-02-07 | ⏭️ skip (video) |
| `1YTGedhyWETWvAyz7NFmtSE7sl7D-Hcsjax7d5vZWLQI` | Ramiro Perez <> Growth4U | 2026-02-17 | ✅ processed |
| `18k6gYbuLqrXBqEcYb-tTIbmJruJOAHcQYzisZQMuBQo` | Ramiro <> Growth4U | 2026-02-19 | ✅ processed |
| `1LiPlPaelBqpL7CLMZid5XdcMvlGB5jCu8-IoRUW3QZc` | Hospital capilar | 2026-02-24 | ✅ processed |
| `1aVyiYKj5DhsDUQRBnQX4iUqEl1RLag1s9tb6WChSo2E` | GTM Hospital capilar - Discord | 2026-02-27 | ✅ processed |
| `1Vh7964tPDqql7W-r9GQzUNyvtxronQGz1mW3kqVgPjU` | Status arquitectura HC | 2026-03-04 | ✅ processed |
| `1MhF-opiBmlvBlXZ5r7ixxj8_bTYiA9n1NSZRCxupeRs` | Avances proyecto HC | 2026-03-06 | ✅ processed |
| `1H8wb4w85UGVX-LIlUZyKRY9uxaByllCyUZmLsNwdYaU` | Avances proyecto HC | 2026-03-09 | ✅ processed |
| `1Y3Th4w4KK3N7TiFreMZk__kX9dWxK69W0avG3J-k8d4` | Análisis de Mercado HC | 2026-03-10 | ✅ processed |
| `1Dun42lJdsRliJVvB7VLjJ3nif_2x-m92NAFFf6aurRs` | HC Lead-Nurturing Madrid | 2026-03-18 | ✅ processed |

**Subfolder scan:** enabled (includeSubfolders: true)

---

## 3. Notion

Not configured. To enable, provide a Notion database URL or ID containing meeting notes.

---

## 4. Filters / Relation

- **Client relation filter:** not yet configured (Notion disabled)
- **Drive filter:** all Google Docs in approved folder (no extra filter needed — folder is client-scoped)
- **Slack filter:** N/A (disabled)

---

## 5. Routing

| Setting | Value |
|---------|-------|
| Publish channel | `#intelligence` (Discord ID: 1475638253154603170) |
| Review owner | Alfonso |
| Timezone | Europe/Madrid |
| Cron schedule | Mon–Fri 18:00 Europe/Madrid |

---

## 6. First Run Result

**Executed:** 2026-05-12  
**Result:** 0 new meetings found — all 11 Drive documents already processed (meetings.json up to date through 2026-03-18)  
**Open items:**
- `11B5kOingoKO1535iZN8htQjoDHfIgUVFbhWoeufMCqI` (Sales Presentation 2026-02-06): file exists in meetings/ folder as `2026-02-06-sales-presentation-g4u.md` but NOT registered in meetings.json — pending reconciliation
- Notion: decide if needed (no DB currently configured)

---

## Open Issues

1. **Notion DB:** currently disabled. Confirm if Notion is used for meeting notes.
2. **Sales Presentation doc:** exists in Drive and has a local .md file but missing from meetings.json index. Add or ignore?
3. **Next meeting:** when the next meeting note lands in the Drive folder, it will be picked up automatically on the 18:00 cron run.
