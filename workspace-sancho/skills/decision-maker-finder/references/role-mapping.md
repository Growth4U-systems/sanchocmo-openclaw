# Role Mapping Guide — Decision Maker Finder

> Mapea buyer personas a roles de busqueda concretos.

---

## Seniority Levels by Deal Size & Company Size

### C-Level

**Roles:**
- CEO, CTO, CMO, CFO, COO, CRO (Chief Revenue Officer), CPO (Chief Product Officer)
- CISO (Chief Information Security Officer), CDO (Chief Data Officer)

**Target when:**
- Enterprise deals (500+ employees)
- Strategic / transformational decisions
- Budget > $50K / year
- Company-wide platform purchases
- Regulatory or compliance-impacted decisions

**Buyer behavior:**
- Delegates research to team, makes final call
- Values ROI, risk mitigation, strategic alignment
- Reachable via warm intros, events, advisory boards
- Unlikely to respond to cold email (use warm paths)

---

### VP-Level

**Roles:**
- VP Marketing, VP Sales, VP Engineering, VP Product
- VP Growth, VP Revenue, VP Customer Success
- VP Operations, VP People / HR, VP Finance

**Target when:**
- Mid-market deals (100-500 employees)
- Departmental budget allocation
- Budget $15K-$50K / year
- Cross-functional tools affecting multiple teams
- Scaling decisions (new processes, new tools)

**Buyer behavior:**
- Hands-on evaluation + budget authority
- Values efficiency, team productivity, clear metrics
- Reachable via LinkedIn, industry events, content marketing
- Responds to peer-validated social proof

---

### Director-Level

**Roles:**
- Director of Marketing, Director of Sales, Director of Engineering
- Director of Product, Director of Growth, Director of RevOps
- Director of Demand Generation, Director of Content
- Director of Customer Success, Director of Partnerships

**Target when:**
- SMB deals (20-100 employees)
- Functional decisions within their domain
- Budget $5K-$15K / year
- Tool purchases for their team
- Process improvements within their department

**Buyer behavior:**
- Deep domain expertise, evaluates personally
- Values ease of implementation, time-to-value
- Reachable via cold outreach (LinkedIn DM, email)
- Responds to tactical content, case studies, demos

---

### Manager-Level

**Roles:**
- Marketing Manager, Growth Manager, Demand Gen Manager
- Product Manager, Engineering Manager, Sales Manager
- Content Manager, Community Manager, SEO Manager
- RevOps Manager, CRM Manager, Analytics Manager

**Target when:**
- Small deals (<20 employees) OR
- Tool/subscription purchases within a team
- Budget < $5K / year
- Individual contributor-level tools
- Free trial / self-serve products (champions, not buyers)

**Buyer behavior:**
- Daily user, bottom-up champion
- Values UX, features, integrations
- Reachable via cold outreach, product-led funnels
- Responds to templates, how-to content, free tools

---

## Role Aliases (Same Person, Different Titles)

> Clave para busquedas exhaustivas: la misma persona puede tener 5 titulos diferentes.

| Canonical Role | Common Aliases |
|----------------|----------------|
| VP Growth | Head of Growth, Director Growth Marketing, Growth Lead, VP Growth Marketing |
| Revenue Operations | Rev Ops, Sales Ops, Revenue Operations Manager, Rev Ops Lead, GTM Ops |
| Demand Generation | Lead Gen, Growth Marketing, Demand Gen Manager, Acquisition Marketing |
| Head of Marketing | VP Marketing, Marketing Director, Marketing Lead, CMO (at small cos) |
| Product Manager | PM, Product Owner, Product Lead, GPM (Group PM) |
| Head of Sales | VP Sales, Sales Director, Sales Lead, CRO (at small cos) |
| Head of Engineering | VP Engineering, Engineering Director, Tech Lead, CTO (at small cos) |
| Customer Success | CS Manager, Account Manager, Client Success, Customer Experience |
| Content Marketing | Content Lead, Content Director, Editorial Director, Head of Content |
| Data / Analytics | Data Lead, Analytics Manager, BI Manager, Head of Data |

**Search strategy:** Always search for ALL aliases of the target role, not just the canonical name.

---

## Decision Tree: Target Seniority Selection

```
START: What is the ICP company size?

├─ Enterprise (500+ employees)
│   ├─ Deal size > $100K → C-Level (CEO, CRO, CMO)
│   ├─ Deal size $50K-$100K → C-Level + VP (dual track)
│   └─ Deal size < $50K → VP-Level (don't bother C-suite)
│
├─ Mid-Market (100-500 employees)
│   ├─ Deal size > $50K → VP-Level (primary) + C-Level (sponsor)
│   ├─ Deal size $15K-$50K → VP-Level
│   └─ Deal size < $15K → Director-Level
│
├─ SMB (20-100 employees)
│   ├─ Deal size > $15K → Director-Level (often == VP here)
│   ├─ Deal size $5K-$15K → Director-Level
│   └─ Deal size < $5K → Manager-Level (or Founder/CEO directly)
│
└─ Startup / Micro (<20 employees)
    ├─ Any deal size → Founder / CEO / CTO (one person decides)
    └─ No seniority hierarchy exists — go to the top
```

---

## Multi-Thread Strategy (Enterprise Deals)

> Para deals enterprise, NO contactes solo a una persona. Necesitas 3-5 stakeholders.

| Role in Deal | Title Range | Purpose |
|--------------|-------------|---------|
| **Economic Buyer** | C-Level, VP | Signs the check, cares about ROI |
| **Champion** | Director, Manager | Internal advocate, uses the product |
| **Technical Evaluator** | Engineer, Architect, IT | Validates tech fit, security, integration |
| **End User** | Manager, IC | Will use daily, cares about UX |
| **Blocker** | Legal, Procurement, IT Security | Can say NO but not YES |

**Decision-maker-finder priority:** Economic Buyer (primary) + Champion (backup)

---

## Mapping ECPs to Search Roles

> Usa los Extended Customer Profiles de SanchoCMO para definir roles de busqueda.

```
From ECP (./brand/ecps.json):
  └─ buyer_persona:
       ├─ title_pattern → Direct search term
       ├─ department → Filter for search
       ├─ seniority → Level to target
       └─ reports_to → Secondary contact (escalation)

Example:
  ECP says: "VP Marketing at B2B SaaS, reports to CMO"

  Search plan:
    Primary: "VP Marketing" + all aliases
    Secondary: "CMO" (economic buyer above)
    Tertiary: "Director Marketing" or "Head of Demand Gen" (champion below)
```

---

## Industry-Specific Title Variations

| Industry | Marketing Title | Sales Title | Tech Title |
|----------|----------------|-------------|------------|
| SaaS | VP Growth, Head of PLG | VP Sales, CRO | VP Engineering, CTO |
| Fintech | CMO, Head of Marketing | VP Business Dev, Head of BD | CTO, CISO |
| E-commerce | VP Marketing, Head of E-comm | VP Sales, Head of Marketplace | CTO, VP Product |
| Healthcare | VP Marketing, Head of Comms | VP Business Dev, VP Partnerships | CTO, CMIO |
| Real Estate | Director Marketing, Head of Brand | VP Sales, Head of Agents | CTO, VP Product |

---

*Siempre busca el rol canonical + todos los aliases. Mejor 3 busquedas con aliases que 1 busqueda exacta.*
