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

## Dev mode vs production mode

The app serves its UI two different ways. Pick the one you need:

| | Production (`npm start`) | Dev (`npm run dev`) |
|--------|--------------------------|---------------------|
| UI delivery | Vite build inlined in `resources/read` | Loaded live from the Vite dev server |
| HMR (hot reload) | No | **Yes** |
| Breakpoints | Minified, hard | **Full TypeScript breakpoints** |
| Refresh after edit | rebuild + manual refresh | automatic |

### Production — `npm start`

```bash
npm start
```

Runs `vite build` then connects the relay. UI is bundled and inlined into the MCP
response — self-contained, nothing to reach over the network. Use this for demos
and deployment.

### Dev — `npm run dev`

```bash
npm run dev
```

Starts a live Vite dev server and points the hub iframe at it, so you get HMR and
real breakpoints while editing `src/ui/`. The relay WebSocket still carries the
MCP protocol and `app.rest()` calls — only the **UI assets** come from Vite.

Choose how the hub iframe reaches the Vite server with `DEV_TUNNEL` (in `.env`):

```bash
# Same machine (default): you open the hub in a browser on the SAME computer
# that runs `npm run dev`. The iframe loads http://localhost:5179 directly —
# no tunnel, no extra tools.
DEV_TUNNEL=localhost      # default, can be omitted

# Different machine: the hub is opened on another computer/device. A public
# tunnel is needed so that browser can reach your Vite server.
DEV_TUNNEL=cloudflared    # spins up a cloudflared quick tunnel (binary required)
```

Optional `.env` overrides:

```bash
VITE_PORT=5179            # local Vite port (default 5179)
PUBLIC_URL=https://...    # reuse your own tunnel instead of spawning cloudflared
                          # (only used when DEV_TUNNEL=cloudflared)
```

**Setting breakpoints:** open the hub in Chrome → DevTools → Sources → find the
iframe origin (`localhost:5179` or your tunnel host) → set breakpoints in the
`.tsx` source directly (Vite serves source maps).

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
├── mcp-message-handlers.ts  # MCP handlers; inline UI (prod) or Vite dev URL (dev)
├── dev-server.ts            # Dev mode: Vite dev server + localhost/cloudflared transport
└── ui/                      # React UI (identical to direct version)
    ├── App.tsx
    ├── main.tsx
    └── ...
```
