# foundation-state.json v2.0 Schema

## Estructura

```json
{
  "version": "2.0",
  "started_at": "ISO timestamp",
  "updated_at": "ISO timestamp",
  "sections": {
    "company-brief": {
      "status": "approved|in-progress|not-started",
      "layer": 0,
      "output_dir": "brand/{slug}/company-brief/",
      "approved_at": "ISO timestamp or null",
      "skills": {
        "company-context": { "status": "approved", "completed_at": "ISO" },
        "business-model": { "status": "approved", "completed_at": "ISO" },
        "budget": { "status": "approved", "completed_at": "ISO" }
      }
    },
    "market-and-us": {
      "status": "in-progress|not-started|approved",
      "layer": 1,
      "output_dir": "brand/{slug}/market-and-us/",
      "pillars": {
        "market-analysis": {
          "status": "approved",
          "layer": 1,
          "requires": ["company-brief"],
          "enriches_with": ["competitor-analysis", "self-analysis"],
          "output_file": "brand/{slug}/market-and-us/market-analysis.md",
          "approved_at": "ISO",
          "skill": "market-intelligence"
        },
        "competitor-analysis": {
          "status": "in-progress",
          "layer": 1,
          "requires": ["company-brief"],
          "enriches_with": ["market-analysis", "self-analysis"],
          "output_files": [
            "brand/{slug}/market-and-us/competitor-acme.md",
            "brand/{slug}/market-and-us/competitor-betacorp.md"
          ],
          "skill": "competitor-intelligence"
        },
        "self-analysis": {
          "status": "not-started",
          "layer": 1,
          "requires": ["company-brief"],
          "enriches_with": ["market-analysis", "competitor-analysis"],
          "output_file": "brand/{slug}/market-and-us/self-analysis.md",
          "skill": "self-intelligence"
        },
        "swot": {
          "status": "not-started",
          "layer": 2,
          "requires": ["market-analysis", "competitor-analysis", "self-analysis"],
          "output_file": "brand/{slug}/market-and-us/swot.md",
          "skill": "swot-analysis"
        }
      },
      "syntheses": {
        "summary": {
          "status": "not-generated",
          "output_file": "brand/{slug}/market-and-us/summary.md",
          "generated_by": "orchestrator",
          "requires": ["market-analysis", "competitor-analysis", "self-analysis"]
        },
        "ope-canvas": {
          "status": "not-generated",
          "output_file": "brand/{slug}/market-and-us/ope-canvas.md",
          "generated_by": "orchestrator",
          "requires": ["market-analysis", "competitor-analysis", "self-analysis"]
        }
      }
    },
    "go-to-market": {
      "status": "not-started",
      "layer": 3,
      "output_dir": "brand/{slug}/go-to-market/",
      "pillars": {
        "niche-discovery": {
          "status": "not-started",
          "layer": 3,
          "requires": ["swot"],
          "enriches_with": ["existing-customer-data"],
          "output_file": "brand/{slug}/go-to-market/ecps.md",
          "skill": "niche-discovery-100x"
        },
        "existing-customer-data": {
          "status": "not-started",
          "layer": 3,
          "requires": ["company-brief"],
          "optional": true,
          "output_file": "brand/{slug}/go-to-market/existing-customer-data.md",
          "skill": "existing-customer-data"
        },
        "positioning": {
          "status": "not-started",
          "layer": 4,
          "requires": ["niche-discovery"],
          "output_pattern": "brand/{slug}/go-to-market/positioning-{ecp-slug}.md",
          "skill": "positioning-messaging"
        },
        "pricing": {
          "status": "not-started",
          "layer": 4,
          "requires": ["niche-discovery"],
          "enriches_with": ["positioning"],
          "output_file": "brand/{slug}/go-to-market/pricing.md",
          "skill": "pricing-strategy"
        },
        "ecp-validation": {
          "status": "not-started",
          "layer": 4,
          "requires": ["niche-discovery"],
          "optional": true,
          "skill": "ecp-validation"
        }
      },
      "syntheses": {
        "messaging-summary": {
          "status": "not-generated",
          "output_file": "brand/{slug}/go-to-market/messaging-summary.md",
          "generated_by": "orchestrator",
          "requires": ["positioning"]
        }
      }
    },
    "brand-identity": {
      "status": "not-started",
      "layer": 5,
      "output_dir": "brand/{slug}/brand-identity/",
      "pillars": {
        "brand-voice": {
          "status": "not-started",
          "layer": 5,
          "requires": ["positioning"],
          "output_file": "brand/{slug}/brand-identity/voice-profile.md",
          "skill": "brand-voice"
        },
        "visual-identity": {
          "status": "not-started",
          "layer": 5,
          "requires": ["brand-voice"],
          "output_file": "brand/{slug}/brand-identity/visual-identity.md",
          "skill": "visual-identity"
        }
      }
    }
  }
}
```

## Notas

- `sections.X.status` = status agregado de la sección (derived de sus pillars)
- `company-brief` es especial: tiene `skills` en vez de `pillars` porque las 3 skills escriben al mismo doc
- `competitor-analysis` usa `output_files` (array) porque genera 1 archivo por competidor
- `positioning` usa `output_pattern` porque genera 1 archivo por ECP
- `syntheses` son generadas por el orchestrator, no por skills dedicados
- `optional: true` indica pilares que se pueden skipear sin bloquear downstream
- Los `requires` y `enriches_with` redundan lo del foundation-protocol.md — esto permite gate check programático
