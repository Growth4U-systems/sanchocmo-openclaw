# Discord Thread Protocol — DEPRECATED

> Movido a **[publish-protocol.md](publish-protocol.md)** (transport-agnostic).
>
> La publicación de outputs de cron ya no usa el tool de Discord ni IDs de canal hardcodeados:
> todo va por `POST /api/integrations/publish`, que resuelve transporte y canal desde
> `client-config.json` (Slack por defecto). Ver `publish-protocol.md`.
