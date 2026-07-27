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
}

const AppContext = createContext<McpApp | null>(null);

function createDefaultApp(): McpApp {
  let connected = false;
  let nextId = 1;
  let contextHandler: ((context: any) => void) | undefined;
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
    set onhostcontextchanged(handler: ((context: any) => void) | undefined) { contextHandler = handler; },
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
  userRoles: string[]; userToken?: string; roomSlug?: string; appId?: string; appUrl?: string;
}
const emptyContext: PrivosContext = {
  userId: '', username: '', theme: 'light', roomId: '', roomName: '', userRoles: [],
};

export function usePrivosContext(): PrivosContext {
  const app = usePrivosApp();
  const [context, setContext] = useState(emptyContext);
  useEffect(() => {
    app.onhostcontextchanged = (next) => setContext((current) => ({ ...current, ...next }));
    void app.callServerTool({ name: 'privos.context.get', arguments: {} })
      .then((result) => {
        const next = typeof result?.content?.[0]?.text === 'string'
          ? JSON.parse(result.content[0].text) : result;
        setContext((current) => ({ ...current, ...next }));
      })
      .catch(() => undefined);
    return () => { app.onhostcontextchanged = undefined; };
  }, [app]);
  return context;
}

export function usePrivosUserToken() {
  return usePrivosContext().userToken;
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
