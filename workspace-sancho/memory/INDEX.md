# Memory Index
> Auto-maintained. Last updated: 2026-03-16.

## Structure
```
memory/
├── daily/          ← Daily notes (YYYY-MM-DD.md)
├── topics/         ← Topic-specific deep dives
├── clients/        ← Per-client curated memory
├── archive/        ← Old daily notes (>30d)
├── skills.md       ← Skills changelog
├── INDEX.md        ← This file
├── *.json          ← State trackers
└── *.sqlite        ← OpenClaw search indices (managed by system)
```

## Daily Notes (memory/daily/)
Active daily logs. Format: YYYY-MM-DD.md.

## Topic Notes (memory/topics/)
Deep dives on specific subjects. Format: YYYY-MM-DD-topic.md.

## Client Memory (memory/clients/)
One file per client slug with curated facts, decisions, and state.
- hospital-capilar.md
- paymatico.md
- sanchocmo.md
- growth4u.md

## State Files (memory/*.json)
- heartbeat-state.json — Heartbeat check rotation
- onboarding-state.json — SanchoCMO onboarding
- onboarding-alexg-state.json — Paymático onboarding
- onboarding-state-growth4u.json — Growth4U onboarding
- onboarding-state-kleva.json — Kleva onboarding (in progress)
- foundation-state.json — Foundation pillar tracker
- healthcheck-state.json — System health checks
- cost-alert.json — Cost anomaly alerts
- cost-data.json — Historical cost data
- backup-state.json — Backup status

## Archive (memory/archive/)
Daily notes older than 30 days. Compacted monthly.
