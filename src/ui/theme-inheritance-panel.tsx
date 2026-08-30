/**
 * Theme inheritance panel — visible proof that this app inherits the workspace theme.
 *
 * The Hub broadcasts the current light/dark mode plus a curated set of 12 `--base-*`
 * design tokens over the MCP-app postMessage bridge (`ui/initialize` +
 * `HOST_CONTEXT_CHANGED`, re-sent on every mode flip AND on a live theme save).
 * `@privos_ai/app-react`'s `PrivosAppProvider` (SDK >= 0.6.0) already writes every
 * token onto this document's `<html>` as a real CSS custom property before this
 * component ever renders — that is what makes the "sample UI" section below restyle
 * itself live, with zero wiring in this file, whenever a workspace admin changes the
 * theme. `usePrivosContext()` is read here only to also print the resolved values.
 *
 * This app is host-agnostic: run it standalone (outside a Privos workspace) or
 * before the first host context arrives and every `--base-*` reference below falls
 * back to this file's own hardcoded palette (see the CSS `theme-demo-*` rules), so
 * nothing here assumes a Privos parent frame exists.
 */
import { usePrivosContext } from '@privos_ai/app-react';

/** One entry per token in the Hub's curated broadcast set (`MCP_APP_THEME_TOKEN_KEYS`). */
type TokenKind = 'color' | 'radius' | 'font';

interface TokenDescriptor {
  key: string;
  label: string;
  kind: TokenKind;
}

const THEME_TOKENS: TokenDescriptor[] = [
  { key: '--base-primary', label: 'Primary action colour', kind: 'color' },
  { key: '--base-primary-hover', label: 'Primary action colour (hover)', kind: 'color' },
  { key: '--base-bg-main', label: 'Main background', kind: 'color' },
  { key: '--base-bg-menu', label: 'Menu / sidebar background', kind: 'color' },
  { key: '--base-bg-surface', label: 'Card / surface background', kind: 'color' },
  { key: '--base-bg-header', label: 'Header / table-head background', kind: 'color' },
  { key: '--base-border', label: 'Border colour', kind: 'color' },
  { key: '--base-text-primary', label: 'Primary text colour', kind: 'color' },
  { key: '--base-text-secondary', label: 'Secondary text colour', kind: 'color' },
  { key: '--base-info', label: 'Link / info colour', kind: 'color' },
  { key: '--base-radius-md', label: 'Corner radius', kind: 'radius' },
  { key: '--base-font-family', label: 'Font family', kind: 'font' },
];

export default function ThemeInheritancePanel() {
  const { theme, themeTokens } = usePrivosContext();
  const tokensProvided = themeTokens && Object.keys(themeTokens).length > 0;

  return (
    <div className="container theme-demo-container">
      <h1>Theme inheritance</h1>
      <p className="theme-demo-intro">
        This app is a cross-origin iframe — it never reads the Hub's own stylesheet. Instead the
        Hub pushes the workspace theme over the postMessage bridge, and the SDK applies it to this
        document automatically. Everything below this line is live: change the workspace theme
        (or flip light/dark) and it restyles without a reload.
      </p>

      <div className="theme-demo-mode">
        Current mode: <strong>{theme || 'unknown'}</strong>
      </div>

      {!tokensProvided && (
        <p className="theme-demo-degraded">
          No <code>themeTokens</code> from the host (older Hub, or run standalone outside a Privos
          workspace) — the sample UI below is using this app&apos;s own fallback palette instead.
        </p>
      )}

      <h2>Resolved tokens</h2>
      <div className="theme-demo-token-grid">
        {THEME_TOKENS.map((token) => (
          <TokenRow key={token.key} token={token} resolvedValue={themeTokens?.[token.key]} />
        ))}
      </div>

      <h2>Sample UI, styled purely via these tokens</h2>
      <div className="theme-demo-sample-row">
        <button type="button" className="theme-demo-btn">
          Primary button
        </button>
        <a href="#" className="theme-demo-link" onClick={(e) => e.preventDefault()}>
          Themed link
        </a>
      </div>
      <div className="theme-demo-card">
        <div className="theme-demo-card-title">Bordered card</div>
        <div className="theme-demo-card-body">
          Background, border, corner radius, and text colour all come from <code>--base-*</code>{' '}
          tokens — none of this card&apos;s styling is hardcoded.
        </div>
      </div>
    </div>
  );
}

function TokenRow({ token, resolvedValue }: { token: TokenDescriptor; resolvedValue: string | undefined }) {
  return (
    <div className="theme-demo-token-row">
      <div className="theme-demo-token-label">{token.label}</div>
      <div className="theme-demo-token-code">{token.key}</div>
      <TokenPreview token={token} />
      <div className="theme-demo-token-value">{resolvedValue ?? '(not provided — using fallback)'}</div>
    </div>
  );
}

function TokenPreview({ token }: { token: TokenDescriptor }) {
  if (token.kind === 'color') {
    return <span className="theme-demo-swatch" style={{ background: `var(${token.key})` }} />;
  }
  if (token.kind === 'radius') {
    return <span className="theme-demo-radius-sample" style={{ borderRadius: `var(${token.key})` }} />;
  }
  // font
  return (
    <span className="theme-demo-font-sample" style={{ fontFamily: `var(${token.key})` }}>
      Aa
    </span>
  );
}
