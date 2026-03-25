# privos-demo-hrm-ws

HR management demo app for Privos Chat — **relay WebSocket** version.

Unlike the [direct version](https://github.com/PrivOS-AI/privos-demo-hrm) which requires a public URL, this app connects **outbound** to Privos via WebSocket. No HTTP server, no public URL, no port forwarding.

## How it works

```
This app (behind NAT)  --WSS-->  Privos Server
                                    |
                       MCP JSON-RPC over WebSocket
                       (initialize, tools/list, tools/call, resources/read)
                                    |
                       UI HTML delivered inline (fully self-contained)
```

1. On first run, app pairs with Privos via a one-time URL (credentials saved to `.env`)
2. On subsequent runs, app authenticates via OAuth and connects WS
3. Privos discovers tools, app goes "online"
4. UI is built by Vite, inlined in `resources/read` — no external URL references

## Setup

```bash
# Clone the SDK (needed for @privos/app-react)
git clone https://github.com/PrivOS-AI/privos-app-packages ../privos-app-packages

npm install
npm start
```

On first run (no `.env` credentials):
```
No Privos credentials found. Starting pairing flow...
Get a pairing URL from: Privos Admin → Apps → Register Relay App

Enter the Privos relay pairing URL: wss://privos.example.com/api/v1/mcp-apps.relay?pair=abc...

[Relay] Paired! Credentials saved to .env
[Relay] Connected to Privos
```

That's it. Next `npm start` just connects — no prompts.

## Differences from direct version

| Aspect | Direct (privos-demo-hrm) | Relay (this repo) |
|--------|-------------------------|-------------------|
| Connection | Privos → App via HTTP | App → Privos via WS |
| Public URL | Required | Not needed |
| HTTP server | Express (manifest, /mcp, static) | None |
| UI delivery | Browser loads from app URL | Inlined in resources/read |
| Setup | Manual credential copy | One-time pairing URL |
| UI code | Identical | Identical |

## Project structure

```
src/
├── server.ts                # Entry: pairing flow + relay connect
├── relay-client.ts          # WS client: pairing, OAuth, auto-reconnect
├── mcp-message-handlers.ts  # MCP handlers, inline UI from Vite build
└── ui/                      # React UI (identical to direct version)
    ├── App.tsx
    ├── main.tsx
    └── ...
```
