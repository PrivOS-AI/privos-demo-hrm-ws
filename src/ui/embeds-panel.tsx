/**
 * Embeds panel — demonstrates the workspace's external-embed allowlist.
 *
 * The app *declares* the origins it would like to embed (`tools[].ui.csp['frame-src']` in
 * privos-app.json). That declaration grants nothing: a workspace admin approves the origins this
 * app may actually embed. So the same build behaves differently per workspace, which is exactly
 * what this panel makes visible.
 *
 * Two very different mechanisms are shown side by side:
 *
 *   - A *hoisted* provider embed (`useProviderEmbed`). This app document is sandboxed into an
 *     opaque origin, and providers like YouTube refuse to initialize there — an iframe we create
 *     ourselves stays blank even once approved. So we render a placeholder and the Hub renders the
 *     real provider frame over it, outside our sandbox, after re-authorizing the URL itself.
 *   - A raw iframe to an origin this app never declared, which must never load under enforcement.
 *     That is the negative control, and it still teaches what the CSP does.
 *
 * Anything the browser refuses arrives as a `securitypolicyviolation` event, listed below, so an
 * operator can see the policy working rather than having to infer it from an empty box.
 */
import { useEffect, useState } from 'react';
import { useProviderEmbed } from '@privos_ai/app-react';

/** Declared in the manifest, so an admin can approve it. */
const DECLARED_PROVIDER = 'https://www.youtube.com';
const DECLARED_EMBED = `${DECLARED_PROVIDER}/embed/M7lc1UVf-VE`;

/** Never declared and never approvable through this app — the negative control. */
const UNDECLARED_ORIGIN = 'https://example.com';

type Violation = { blockedURI: string; directive: string; at: string };

const FRAME_STYLE = {
  width: '100%',
  maxWidth: 560,
  aspectRatio: '16 / 9',
  border: '1px solid rgba(128,128,128,0.4)',
  borderRadius: 6,
} as const;

/** What the panel says about each state, in the operator's terms rather than the protocol's. */
function describe(state: string, reason?: string): string {
  switch (state) {
    case 'granted':
      return 'Approved — the Hub is rendering this provider above the placeholder.';
    case 'requesting':
      return 'Asking the Hub to render this provider…';
    case 'unsupported':
      return 'This Hub does not render hoisted embeds; falling back to an in-page frame (which the sandbox will block).';
    default:
      break;
  }
  if (reason === 'origin-not-approved') {
    return 'Refused: no administrator has approved this origin for this app yet.';
  }
  if (reason === 'limit-exceeded') {
    return 'Refused: this app already holds the maximum number of embeds.';
  }
  return `Refused: ${reason ?? 'unknown reason'}.`;
}

/**
 * A provider embed the Hub renders for us. We own the placeholder box and its layout; the Hub
 * mirrors its position and clips the frame to this app's own area.
 */
function HoistedEmbed({ title, url, caption }: { title: string; url: string; caption: string }) {
  const { ref, state, reason } = useProviderEmbed(url);

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 4 }}>{title}</h3>
      <p style={{ opacity: 0.75, marginTop: 0, fontSize: 13 }}>{caption}</p>
      <div
        ref={ref}
        style={{
          ...FRAME_STYLE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(128,128,128,0.08)',
        }}
      >
        {/* Stays visible until the Hub actually paints over it — including on an older Hub, where
            this is the only thing the user will ever see here. */}
        {state === 'granted' ? null : (
          <span style={{ fontSize: 13, opacity: 0.7, padding: 12, textAlign: 'center' }}>{describe(state, reason)}</span>
        )}
      </div>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
        state: <code>{state}</code>
        {reason ? (
          <>
            {' '}
            · reason: <code>{reason}</code>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** A frame this app renders itself — kept to show what the policy blocks. */
function RawFrame({ title, src, caption }: { title: string; src: string; caption: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 4 }}>{title}</h3>
      <p style={{ opacity: 0.75, marginTop: 0, fontSize: 13 }}>{caption}</p>
      <iframe src={src} title={title} onLoad={() => setLoaded(true)} style={FRAME_STYLE} />
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
        {loaded ? 'Frame reported load.' : 'No load event yet — blocked, still loading, or the provider refused it.'}
      </div>
    </div>
  );
}

export default function EmbedsPanel() {
  const [violations, setViolations] = useState<Violation[]>([]);

  useEffect(() => {
    const onViolation = (event: SecurityPolicyViolationEvent) => {
      setViolations((previous) => [
        ...previous,
        {
          blockedURI: event.blockedURI,
          directive: event.effectiveDirective || event.violatedDirective,
          at: new Date().toLocaleTimeString(),
        },
      ]);
    };
    document.addEventListener('securitypolicyviolation', onViolation);
    return () => document.removeEventListener('securitypolicyviolation', onViolation);
  }, []);

  const frameViolations = violations.filter((v) => v.directive.startsWith('frame-src'));

  return (
    <div style={{ padding: 20, maxWidth: 680 }}>
      <h2 style={{ marginTop: 0 }}>External embeds</h2>
      <p style={{ opacity: 0.75, marginTop: -6 }}>
        This app declares <code>{DECLARED_PROVIDER}</code> in its manifest. A declaration is only a
        request — an administrator approves which origins this app may embed. Because this app runs
        in a sandboxed frame with an opaque origin, providers cannot start up inside it; the Hub
        renders an approved provider itself, over the placeholder below.
      </p>

      <HoistedEmbed
        title="Declared provider"
        url={DECLARED_EMBED}
        caption="Rendered by the Hub once an administrator approves this origin for this app."
      />

      <RawFrame
        title="Undeclared origin"
        src={UNDECLARED_ORIGIN}
        caption="Framed by this app itself, from an origin it never declared. Under an enforced policy this must not load."
      />

      <h3 style={{ marginBottom: 6 }}>Blocked by policy</h3>
      {frameViolations.length === 0 ? (
        <p style={{ opacity: 0.7, fontSize: 13, marginTop: 0 }}>
          No frame blocked so far. In a workspace with no policy enforced, nothing is blocked and the
          frame above may load.
        </p>
      ) : (
        <ul style={{ fontSize: 13, paddingLeft: 18 }}>
          {frameViolations.map((v, index) => (
            <li key={`${v.blockedURI}-${index}`} style={{ marginBottom: 4 }}>
              <code>{v.blockedURI}</code> — refused by <code>{v.directive}</code> at {v.at}
            </li>
          ))}
        </ul>
      )}

      <p style={{ opacity: 0.6, fontSize: 12, marginTop: 18 }}>
        Note: approving an origin permits it. Figma private files additionally need storage access,
        which no sandboxed app frame can obtain.
      </p>
    </div>
  );
}
