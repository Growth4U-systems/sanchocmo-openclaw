# Gateway Protocol

## WebSocket Connection Flow

```
Client → connect.challenge → Ed25519 device signature → connect → hello-ok
```

## Device Auth (Ed25519)

- Requerido para `operator.write` scopes — sin firma, solo read
- v2 payload: `v2|deviceId|clientId|clientMode|role|scopes|signedAt|token|nonce`
- Nuevo device → requiere `openclaw devices approve <requestId>` incluso en localhost
- Localhost auto-approves pairing pero SOLO después de un `openclaw devices approve`

## Client IDs Válidos

`cli`, `webchat`, `openclaw-control-ui`, `gateway-client`, etc.

## Client Modes Válidos

`webchat`, `cli`, `ui`, `backend`, `node`, `probe`, `test`

## Scopes por Mode

- Mode `webchat` NO concede `operator.write` — necesita device auth completo
- `dangerouslyDisableDeviceAuth` salta el identity check pero NO eleva scopes
- `allowInsecureAuth` es para HTTP non-secure context, no para scope elevation

## Channel Plugin vs WS Proxy

- **Channel plugin** (mc-chat) es el approach correcto: portable, funciona hosteado, usa el sistema de Channels de OpenClaw
- **WS proxy** es un hack: solo funciona en localhost/Tailscale, no es portable
- Antes de reimplementar desde cero, verificar si el componente existente tiene un bug puntual vs un defecto de diseño
