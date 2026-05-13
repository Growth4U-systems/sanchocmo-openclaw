# Meeting Intelligence — Raw Sync Result
**Run ID:** mir_bb6fe98d41ebe5cd50b7c087  
**Ejecutado:** 2026-05-13 00:50 CEST  
**Estado final:** ✅ completed

---

## Meetings procesados — `raw_available` (12)

| Fecha | Título | Drive Doc ID |
|-------|--------|-------------|
| 2026-01-29 | Hospital Capilar - Growth4U | 1kWhI6MslDemmN0U7vLe4VY6kb5DH5fOWjk5GW_a78E8 |
| 2026-02-06 | HC Sales Presentation | 11B5kOingoKO1535iZN8htQjoDHfIgUVFbhWoeufMCqI |
| 2026-02-07 | Heiver <> G4U | 1knNkCRakIM2xAIM5NHKcXmxDPLSlhUp3p3MOnO0rFNU |
| 2026-02-17 | Ramiro Perez <> Growth4U | 1YTGedhyWETWvAyz7NFmtSE7sl7D-Hcsjax7d5vZWLQI |
| 2026-02-19 | Ramiro <> Growth4U | 18k6gYbuLqrXBqEcYb-tTIbmJruJOAHcQYzisZQMuBQo |
| 2026-02-24 | Hospital capilar | 1LiPlPaelBqpL7CLMZid5XdcMvlGB5jCu8-IoRUW3QZc |
| 2026-02-27 | GTM Hospital capilar - Discord | 1aVyiYKj5DhsDUQRBnQX4iUqEl1RLag1s9tb6WChSo2E |
| 2026-03-04 | Status arquitectura Hospital Capilar | 1Vh7964tPDqql7W-r9GQzUNyvtxronQGz1mW3kqVgPjU |
| 2026-03-06 | Avances proyecto - HC | 1MhF-opiBmlvBlXZ5r7ixxj8_bTYiA9n1NSZRCxupeRs |
| 2026-03-09 | Avances proyecto HC 09/03 | 1H8wb4w85UGVX-LIlUZyKRY9uxaByllCyUZmLsNwdYaU |
| 2026-03-10 | Análisis de Mercado y Competidores HC | 1Y3Th4w4KK3N7TiFreMZk__kX9dWxK69W0avG3J-k8d4 |
| 2026-03-18 | HC Lead-Nurturing Madrid | 1Dun42lJdsRliJVvB7VLjJ3nif_2x-m92NAFFf6aurRs |

**Nota:** 6 meetings ya tenían raw_text de runs previos (mantenidos). 

---

## Meetings sin fuente — `needs_raw_sync` (9)

| Meeting ID | Motivo |
|-----------|--------|
| mim_34da7f6699c4add879fcaf38 | local_file_only_no_drive_source |
| mim_48a430a0cf24fa4293e54452 | duplicate_local_file |
| mim_d69ef7f305e96b3181a0031f | duplicate_local_file |
| mim_2391d5dcc87cab01a4e3ee33 | g4u_internal_not_hc_source |
| mim_9a9abf29af10139084dd51a9 | duplicate_local_file |
| mim_3929811bc3ea14516469c750 | duplicate_of_lead_nurturing_madrid |
| mim_38065f3db3c834cf4390ce12 | no_drive_file_found_post_march |
| mim_671358e7443846df1445b366 | no_drive_file_found_post_march |
| mim_19d1b4f22bb1bc0ab4715600 | no_drive_file_found_post_march |

---

## Insights generados (este run)

| Tipo | Count |
|------|-------|
| decisions | 15 |
| action_items | 25 |
| insights | 20 |
| quotes | 12 |
| risks | 10 |
| **Total** | **82** |

## Document impacts | 10 (status: review — sin aplicar)
## Recommendations | 50 (status: recommended — pendientes de aprobación)

---

## Notas

- **JSON parse failures** en 6 docs grandes (>12k chars): raw_text guardado correctamente, insights no generados para esas reuniones. Candidatos para re-run con contexto reducido: 2026-01-29, 2026-02-07, 2026-02-17, 2026-02-27, 2026-03-04, 2026-03-06, 2026-03-10.
- **Docs canónicos**: ninguno modificado. Todo en status `reviewable` / `recommended`.
- **Meetings post-marzo** (April): no tienen doc en Drive. Añadir a la carpeta cuando estén disponibles.
