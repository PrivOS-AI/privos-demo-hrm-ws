# privos-demo-hrm-ws

HR management demo app for Privos Chat — **relay WebSocket** version.

Unlike the [direct version](https://github.com/PrivOS-AI/privos-demo-hrm) which requires a public URL, this app connects **outbound** to Privos via WebSocket. No public URL or port forwarding needed.

## How it works

```
This app (behind NAT)  --WSS-->  Privos Server
                                    |
                       MCP JSON-RPC over WebSocket
                       (initialize, tools/list, tools/call, resources/read)
```

1. App obtains OAuth access token via `client_credentials` grant
2. App connects to `wss://privos/api/v1/mcp-apps.relay` with bearer token
3. Privos discovers tools over the WS, app goes "online"
4. Users install the app in rooms — UI and tool calls route through the WS

## Setup

### 1. Register in Privos

Admin Panel → Apps → **Register Relay App** → enter "Demo HR Management" → copy credentials.

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your PRIVOS_URL, CLIENT_ID, CLIENT_SECRET
```

### 3. Run

```bash
npm install
npm run dev
```

The app connects to Privos automatically. Check the admin panel — you should see a green dot next to the app.

### 4. Use

Go to any room → install the app → open the app tab. Same UX as the direct version.

## Differences from direct version

| Aspect | Direct (privos-demo-hrm) | Relay (this repo) |
|--------|-------------------------|-------------------|
| Connection | Privos calls app via HTTP | App calls Privos via WS |
| Public URL | Required | Not needed |
| MCP transport | Express `/mcp` route | WebSocket message handlers |
| Auth | Privos authenticates to app | App authenticates to Privos (OAuth) |
| UI code | Identical | Identical |

The `src/ui/` directory is unchanged — relay vs direct is purely server-side transport.

## Project structure

```
src/
├── server.ts                # Entry: starts relay client + Vite UI server
├── relay-client.ts          # WS client: OAuth auth, connect, auto-reconnect
├── mcp-message-handlers.ts  # MCP method handlers (shared logic)
└── ui/                      # React UI (identical to direct version)
    ├── App.tsx
    ├── main.tsx
    └── ...
```
