import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react';

export interface RestRequestParams {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean>;
  body?: any;
  timeoutMs?: number;
}
export interface RestResponse<T = any> { statusCode: number; body: T }
export interface McpApp {
  connect(): Promise<void>;
  disconnect(): void;
  callServerTool(params: { name: string; arguments: Record<string, any> }): Promise<any>;
  rest(params: RestRequestParams): Promise<RestResponse>;
  uploadFile(params: {
    channelId: string; fileName: string; base64Data: string; mimeType?: string;
    folderId?: string; enableEmbedding?: boolean; duplicateAction?: 'replace' | 'keep_both' | 'cancel';
  }): Promise<any>;
  onhostcontextchanged?: (context: any) => void;
  /** Claim the hub's floating AI chat launcher for this iframe mount. */
  registerChatSurface(owns: boolean): Promise<{ ok: true; supported: boolean }>;
  /** Report whether the app's own chat window is showing. */
  setChatOpen(open: boolean): Promise<{ ok: true }>;
  /** Host (re)initialized this mount — per-mount state such as chat ownership must be reclaimed. */
  onhostinitialize?: (() => void) | undefined;
  onhostchatopen?: (() => void) | undefined;
  onhostchatclose?: ((reason: string) => void) | undefined;
}

const AppContext = createContext<McpApp | null>(null);

function createDefaultApp(): McpApp {
  let connected = false;
  let nextId = 1;
  let contextHandler: ((context: any) => void) | undefined;
  let initializeHandler: (() => void) | undefined;
  let chatOpenHandler: (() => void) | undefined;
  let chatCloseHandler: ((reason: string) => void) | undefined;
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.jsonrpc !== '2.0') return;
    if (data.id !== undefined && pending.has(data.id)) {
      const call = pending.get(data.id)!;
      pending.delete(data.id);
      data.error ? call.reject(new Error(data.error.message)) : call.resolve(data.result);
    }
    if (data.method === 'HOST_CONTEXT_CHANGED') contextHandler?.(data.params);
    // Host-initiated notifications carry no id — same branch shape as the published SDK.
    if (data.id === undefined) {
      try {
        if (data.method === 'ui/initialize') initializeHandler?.();
        else if (data.method === 'ui/chat.open') chatOpenHandler?.();
        else if (data.method === 'ui/chat.close') chatCloseHandler?.(String(data.params?.reason ?? ''));
      } catch {
        /* never let a handler throw break the host bridge listener */
      }
    }
  };
  const request = (method: string, params: any, timeoutMs = 10000) => {
    const id = nextId++;
    return new Promise<any>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
      window.setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error(`${method} timeout`));
      }, timeoutMs);
    });
  };
  return {
    async connect() {
      if (connected) return;
      window.addEventListener('message', onMessage);
      connected = true;
    },
    disconnect() {
      window.removeEventListener('message', onMessage);
      connected = false;
    },
    callServerTool: (params) => request('tools/call', params),
    rest: (params) => request('host/rest.request', params, params.timeoutMs ?? 10000),
    uploadFile: (params) => request('host/file.upload', params, 60000),
    registerChatSurface: (owns: boolean) => request('host/chat.register', { owns }, 5000),
    setChatOpen: (open: boolean) => request('host/chat.state', { open }, 5000),
    set onhostcontextchanged(handler: ((context: any) => void) | undefined) { contextHandler = handler; },
    set onhostinitialize(handler: (() => void) | undefined) { initializeHandler = handler; },
    set onhostchatopen(handler: (() => void) | undefined) { chatOpenHandler = handler; },
    set onhostchatclose(handler: ((reason: string) => void) | undefined) { chatCloseHandler = handler; },
  };
}

export function PrivosAppProvider({ children, app }: { children: ReactNode; app?: McpApp; name?: string; version?: string }) {
  const ref = useRef<McpApp>(app || createDefaultApp());
  useEffect(() => {
    void ref.current.connect();
    return () => ref.current.disconnect();
  }, []);
  return <AppContext.Provider value={ref.current}>{children}</AppContext.Provider>;
}

export function usePrivosApp(): McpApp {
  const app = useContext(AppContext);
  if (!app) throw new Error('usePrivosApp must be used within PrivosAppProvider');
  return app;
}

export interface PrivosContext {
  userId: string; username: string; theme: string; roomId: string; roomName: string;
  userRoles: string[]; effectiveScopes?: string[]; roomSlug?: string; appId?: string; appUrl?: string;
}
const emptyContext: PrivosContext = {
  userId: '', username: '', theme: 'light', roomId: '', roomName: '', userRoles: [],
};

function mergeHostContext(current: PrivosContext, input: unknown): PrivosContext {
  const next = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const text = (key: keyof PrivosContext) => typeof next[key] === 'string' ? String(next[key]) : String(current[key] || '');
  return {
    userId: text('userId'), username: text('username'), theme: text('theme') || 'light',
    roomId: text('roomId'), roomName: text('roomName'),
    userRoles: Array.isArray(next.userRoles) ? next.userRoles.filter((role): role is string => typeof role === 'string') : current.userRoles,
    ...(Array.isArray(next.effectiveScopes)
      ? { effectiveScopes: next.effectiveScopes.filter((scope): scope is string => typeof scope === 'string') }
      : current.effectiveScopes ? { effectiveScopes: current.effectiveScopes } : {}),
    ...(text('roomSlug') ? { roomSlug: text('roomSlug') } : {}),
    ...(text('appId') ? { appId: text('appId') } : {}),
    ...(text('appUrl') ? { appUrl: text('appUrl') } : {}),
  };
}

export function usePrivosContext(): PrivosContext {
  const app = usePrivosApp();
  const [context, setContext] = useState(emptyContext);
  useEffect(() => {
    app.onhostcontextchanged = (next) => setContext((current) => mergeHostContext(current, next));
    void app.callServerTool({ name: 'mcpapp.context.get', arguments: {} })
      .then((result) => {
        const next = typeof result?.content?.[0]?.text === 'string'
          ? JSON.parse(result.content[0].text) : result;
        setContext((current) => mergeHostContext(current, next));
      })
      .catch(() => undefined);
    return () => { app.onhostcontextchanged = undefined; };
  }, [app]);
  return context;
}

export function usePrivosCapability(scope: string) {
  const { effectiveScopes } = usePrivosContext();
  return { resolved: Array.isArray(effectiveScopes), granted: Array.isArray(effectiveScopes) && effectiveScopes.includes(scope), scope };
}

export function usePrivosTool<T = any>(toolName: string, args: Record<string, any>) {
  const app = usePrivosApp();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const argsKey = JSON.stringify(args);
  const refetch = useCallback(async () => {
    if (Object.values(args).some((value) => value === '' || value == null)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await app.callServerTool({ name: toolName, arguments: args });
      setData((typeof result?.content?.[0]?.text === 'string'
        ? JSON.parse(result.content[0].text) : result) as T);
    } catch (caught: any) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [app, toolName, argsKey]);
  useEffect(() => { void refetch(); }, [refetch]);
  return { data, loading, error, refetch };
}

export interface UseAppChatSurfaceOptions {
  onOpen?: () => void;
  onClose?: (reason?: string) => void;
}

/**
 * Take over the hub's AI chat launcher so this app renders its own chat window.
 * `supported` is false where the host has no launcher to hand over (standalone page,
 * sidebar panel) — draw your own entry point there.
 */
export function useAppChatSurface(options: UseAppChatSurfaceOptions = {}) {
  const app = usePrivosApp();
  const [resolved, setResolved] = useState(false);
  const [supported, setSupported] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const reportOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    app.setChatOpen(open).catch(() => undefined);
  }, [app]);

  const open = useCallback(() => reportOpen(true), [reportOpen]);
  const close = useCallback(() => reportOpen(false), [reportOpen]);

  useEffect(() => {
    let active = true;
    const claim = () => {
      app.registerChatSurface(true).then(
        (result) => { if (active) { setSupported(Boolean(result?.supported)); setResolved(true); } },
        () => { if (active) { setSupported(false); setResolved(true); } },
      );
    };
    // The host clears per-mount ownership when it initializes the iframe, which can land after
    // this effect's first claim (a deferred module script runs before the `load` event).
    app.onhostinitialize = () => claim();
    app.onhostchatopen = () => {
      optionsRef.current.onOpen?.();
      // Ack promptly or the host's ~1.5s watchdog takes the surface back.
      reportOpen(true);
    };
    app.onhostchatclose = (reason: string) => {
      optionsRef.current.onClose?.(reason);
      setIsOpen(false);
      if (reason !== 'timeout') app.setChatOpen(false).catch(() => undefined);
    };
    claim();
    return () => {
      active = false;
      app.onhostinitialize = undefined;
      app.onhostchatopen = undefined;
      app.onhostchatclose = undefined;
      app.registerChatSurface(false).catch(() => undefined);
    };
  }, [app, reportOpen]);

  return { resolved, supported, isOpen, open, close };
}
