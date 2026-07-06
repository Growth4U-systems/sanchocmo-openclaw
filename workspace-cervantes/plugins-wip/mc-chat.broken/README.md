# openclaw-mc-chat

Channel plugin that connects the Mission Control dashboard webchat to OpenClaw agents.

## Architecture

```
┌─────────────────────────┐
│  Frontend (mc-chat.js)   │
│  WebSocket connection    │
└──────────┬──────────────┘
           │ WS
┌──────────▼──────────────┐
│  MC Server (mc-server.js)│
│  - WS server for chat    │
│  - REST API (threads)    │
│  - Webhook receiver      │
└──────────┬──────────────┘
           │ HTTP POST /mc-chat/inbound
┌──────────▼──────────────┐
│  This Plugin (mc-chat)   │
│  - Validates & dispatches│
│  - Routes to agent       │
└──────────┬──────────────┘
           │ OpenClaw internals
┌──────────▼──────────────┐
│  OpenClaw Gateway        │
│  Sancho (+ specialists   │
│  it delegates to)        │
└──────────┬──────────────┘
           │ outbound sendText
┌──────────▼──────────────┐
│  This Plugin (outbound)  │
│  POST /webhook/mc-chat   │
│  /response → MC Server   │
└──────────┬──────────────┘
           │ WS push
┌──────────▼──────────────┐
│  Frontend receives msg   │
└─────────────────────────┘
```

## Installation

```bash
openclaw plugins install ~/.openclaw/plugins/mc-chat
```

## Configuration

Add to `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "mc-chat": {
      "mcServerUrl": "http://localhost:18790",
      "sharedSecret": "your-shared-secret-here"
    }
  },
  "plugins": {
    "entries": {
      "mc-chat": {
        "enabled": true
      }
    }
  }
}
```

## Inbound API (MC Server → Plugin)

### POST /mc-chat/inbound

MC Server sends user messages here.

**Headers:**
- `Content-Type: application/json`
- `X-MC-Secret: <shared-secret>`

**Body:**
```json
{
  "slug": "example",
  "threadId": "abc123",
  "threadName": "Market Analysis",
  "text": "Analiza el mercado de trasplante capilar en España",
  "userId": "alfonso",
  "userName": "Alfonso",
  "linkedTo": "market-analysis",
  "skill": "market-intelligence",
  "agentId": "sancho"
}
```

**Response:**
```json
{
  "ok": true,
  "chatId": "mc-chat:example:abc123",
  "message": "Message dispatched to agent"
}
```

## Outbound API (Plugin → MC Server)

### POST /webhook/mc-chat/response

Plugin sends agent responses here.

**Headers:**
- `Content-Type: application/json`
- `X-MC-Secret: <shared-secret>`

**Body:**
```json
{
  "slug": "example",
  "threadId": "abc123",
  "text": "## Análisis del mercado...",
  "role": "bot",
  "agent": "sancho",
  "ts": "2026-03-24T23:30:00.000Z"
}
```

## Thread ↔ Session Mapping

Each MC thread maps to an OpenClaw session:
- Session key: `mc-chat:{slug}:{threadId}`
- Thread metadata (linkedTo, skill) is passed as context prefix
- Sancho and the specialists it delegates to (via `Agent(subagent_type="<slug>")`) share the same session/thread

## Health Check

### GET /mc-chat/health

Returns plugin status (no auth required).
