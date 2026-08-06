import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@privos_ai/app-react', () => ({
  usePrivosContext: () => ({ username: 'client-alice', userId: 'client-user-1' }),
  usePrivosTool: () => ({
    data: { verified: true, username: 'alice', userId: 'user-1', roomId: 'room-1' },
    loading: false,
    error: undefined,
    refetch: () => undefined,
  }),
}));

import WhoamiPanel from '../src/ui/whoami-panel';

describe('WhoamiPanel', () => {
  it('renders the separate human and dispatch assertion authorities', () => {
    const rendered = renderToStaticMarkup(createElement(WhoamiPanel));

    expect(rendered).toContain('separate Hub-signed caller credential/JWT');
    expect(rendered).toContain(
      'dispatch assertion separately proves runtime, generation, workspace/room authorization, and request-body binding',
    );
    expect(rendered).toContain('verified caller actor above');
    expect(rendered).not.toContain('carried in a body-bound Hub dispatch assertion');
    expect(rendered).not.toContain('verified dispatch actor');
  });
});
