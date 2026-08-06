import type { AppDescriptor, AppPermissionDescriptor } from '@privos_ai/app-server';
import { createHttpIngressApp } from '@privos_ai/app-server';

import { createManifest } from './manifest';
import { handleMcpMessage } from './mcp-message-handlers';
import { runtimeIdentityClient, runtimeMode, runtimeReadiness } from './runtime-identity';

const manifest = createManifest();
const descriptor: AppDescriptor = {
  id: manifest.name,
  name: manifest.title,
  version: manifest.version,
  title: manifest.title,
  description: manifest.description,
  homepage: manifest.homepage,
  author: manifest.author,
  manifestIcon: manifest.icon,
  permissions: manifest.permissions as readonly AppPermissionDescriptor[],
};

/** Canonical SDK ingress; no assertion, actor, or header logic is app-owned. */
export function startHttpServer(port = Number(process.env.PORT || 3000)) {
  const app = createHttpIngressApp({
    descriptor,
    workloadSecurity: runtimeMode() === 'production-workload' ? 'required' : 'disabled',
    workloadIdentityClient: runtimeIdentityClient,
    ready: {
      check: () => {
        const readiness = runtimeReadiness();
        const ok = readiness.manifestVerified
          && (readiness.mode === 'development-compatibility' || (readiness.identityPaired && readiness.activeAuthorization));
        return { ok, body: readiness };
      },
    },
    handler: (message, context) => handleMcpMessage(message.method, message.id, message.params, context),
  });
  const server = app.listen(port, '0.0.0.0', () => console.log(`Direct MCP server listening on :${port}`));
  return server;
}
