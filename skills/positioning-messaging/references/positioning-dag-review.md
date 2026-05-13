# Positioning DAG Review — Gate de Calidad por ECP

> Ejecutar este prompt DESPUÉS del Self-QA (Step 8) y ANTES de guardar (Step 10).
> Si el score OVERALL < 5/5, corregir action items CRITICAL e IMPORTANT y repetir.
> Adaptar las referencias a "banco" / "Monzo" al cliente y sector real.

---

Perform a **Positioning DAG Review** for this ECP. Analyze the complete positioning storytelling by examining:

## 1. STORYTELLING COHERENCE CHECK
Read the ECP's core elements:
- **Niche name & description**
- **Problem statement**
- **Persona**
- **Pain explanation & score**
- **Positioning statement**

Answer:
- Does the story flow logically from problem → persona → pain → positioning?
- Is there any disconnect in the narrative?
- Rate the storytelling coherence: ⭐⭐⭐⭐⭐ (1-5 stars)

## 2. VALUE CRITERIA ANALYSIS
View all linked Value Criteria for this ECP and answer:

### Relevance Check:
- List each Value Criteria with its Relevance level, **justification**, and **importance weight**
- Does each criterion genuinely address the stated pain/problem?
- Are any criteria irrelevant or tangential to this specific niche?

### Completeness Check:
- Based on the problem/pain described, are there obvious Value Criteria that already exist in the shared list that are MISSING?
- Consider: What would this persona realistically prioritize when choosing {{client_name}}?
- Suggest any missing criteria with justification

### Priority Check:
- Is the Relevance rating (Critical/Very High/High/Medium) appropriate for each criterion?
- Any that should be upgraded or downgraded?

### Internal Overlap Check:
- Review all Value Criteria linked to THIS ECP
- Are any VCs too similar to each other? (e.g., overlapping concepts, redundant criteria)
- If overlap found: Which VCs could be merged or consolidated?
- List any pairs that seem redundant: "[VC A] overlaps with [VC B] because..."

## 3. ASSETS VALIDATION
View all linked Assets for this ECP and answer:

### Reality Check:
- List each Asset
- Is this a REAL {{client_name}} feature/capability that exists TODAY?
- Mark each as: ✅ Real | ⚠️ Planned/Roadmap | ❌ Fictional

### Completeness Check:
- Are there {{client_name}} features that SHOULD be linked but aren't?
- Consider the full product offering

### Proof Quality:
- Does each Asset have compelling Proof text?
- Is the Benefit for User clearly articulated?

### Internal Overlap Check:
- Review all Assets linked to THIS ECP
- Are any Assets too similar to each other? (e.g., same feature described differently, redundant capabilities)
- If overlap found: Which Assets could be merged or consolidated?
- List any pairs that seem redundant: "[Asset A] overlaps with [Asset B] because..."

## 4. MESSAGING ALIGNMENT
View all linked Messaging for this ECP and answer:

### Consistency Check:
- Does each message reflect the Value Criteria and Assets?
- Is there a clear link between what we promise (messaging) and what we deliver (assets)?

### Tone & Targeting:
- Does the messaging tone match the persona?
- Is the language appropriate (technical vs. simple, emotional vs. rational)?

### Gap Analysis:
- Are there Value Criteria or Assets without corresponding messaging?
- Are there messages that don't have supporting assets?

## 5. ORPHAN & DUPLICATE DETECTION
For both Value Criteria and Assets, check if any are connected ONLY to this ECP (not shared with any other niche). These "orphans" could indicate:
- A unique, legitimate differentiator for this niche, OR
- A potential duplicate that should be merged with an existing VC/Asset

### Value Criteria Orphan Check:
- List all Value Criteria linked to this ECP
- For each one, check: Is this VC connected to ANY other ECP?
- If NO (orphan found):
  - Search the full Value Criteria list for similar/overlapping criteria
  - Answer: Could this be merged with an existing VC? Which one?
  - If unique: Is it truly specific to this niche or just poorly connected?

### Assets Orphan Check:
- List all Assets linked to this ECP
- For each one, check: Is this Asset connected to ANY other ECP?
- If NO (orphan found):
  - Search the full Assets list for similar/overlapping assets
  - Answer: Could this be merged with an existing Asset? Which one?
  - If unique: Is it truly specific to this niche or just poorly connected?

### Orphan Summary Table:
| Type | Item Name | Orphan? | Potential Duplicate Of | Recommendation |
|------|-----------|---------|------------------------|----------------|
| VC   | ...       | Yes/No  | [Name] or N/A          | Merge / Keep / Investigate |
| Asset| ...       | Yes/No  | [Name] or N/A          | Merge / Keep / Investigate |

## 6. OBJECTION & LEGAL COVERAGE CHECK

### Objection Coverage:
- List ALL conversion barriers from the company-brief
- For each barrier: Is there at least ONE message in the playbook that neutralizes it?
- If any barrier is uncovered → flag as CRITICAL gap

### Legal Compliance:
- List ALL legal constraints from the company-brief
- Scan EVERY message in the playbook for violations (restricted product names, prohibited claims, etc.)
- If any violation found → flag as CRITICAL and provide compliant alternative

### Data Sourcing:
- List ALL numerical claims/statistics in the messaging
- For each: Does it have an inline `[Fuente](url)` citation or `~estimación` marker?
- If any unattributed data found → flag as CRITICAL

## 7. SUMMARY & RECOMMENDATIONS

Provide a structured summary:

| Dimension | Score (1-5) | Key Issues |
|-----------|-------------|------------|
| Storytelling Coherence | ⭐ | ... |
| Value Criteria Coverage | ⭐ | ... |
| Asset Validity | ⭐ | ... |
| Messaging Alignment | ⭐ | ... |
| Orphan/Duplicate Health | ⭐ | ... |
| Objection & Legal Coverage | ⭐ | ... |
| **OVERALL** | ⭐ | ... |

### Action Items:
1. **CRITICAL** (must fix before delivery): ...
2. **IMPORTANT** (should fix): ...
3. **NICE TO HAVE** (could improve): ...

---

**Gate rule**: OVERALL must be 5/5 to pass. If < 5/5, fix CRITICAL + IMPORTANT items and re-run this review.
