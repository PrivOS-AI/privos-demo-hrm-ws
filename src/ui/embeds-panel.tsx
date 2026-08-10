/**
 * Embeds panel — demonstrates the workspace's external-embed allowlist.
 *
 * The app *declares* the origins it would like to iframe (`tools[].ui.csp['frame-src']` in
 * privos-app.json). That declaration grants nothing: a workspace admin approves the origins
 * this app may actually embed, and the Hub serves this document with a matching `frame-src`
 * Content-Security-Policy. So the same build behaves differently per workspace, which is
 * exactly what this panel makes visible.
 *
 * Two frames are rendered on purpose:
 *   - a declared provider (YouTube), which loads once an admin approves it;
 *   - an origin this app never declared, which must never load under enforcement.
 *
 * Anything the browser refuses arrives as a `securitypolicyviolation` event, listed below, so
 * an operator can see the policy working rather than having to infer it from an empty box.
 */
import { useEffect, useState } from 'react';

/** Declared in the manifest, so an admin can approve it. */
const DECLARED_PROVIDER = 'https://www.youtube.com';
const DECLARED_EMBED = `${DECLARED_PROVIDER}/embed/M7lc1UVf-VE`;

/** Never declared and never approvable through this app — the negative control. */
const UNDECLARED_ORIGIN = 'https://example.com';

type Violation = { blockedURI: string; directive: string; at: string };

function Frame({ title, src, caption }: { title: string; src: string; caption: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 4 }}>{title}</h3>
      <p style={{ opacity: 0.75, marginTop: 0, fontSize: 13 }}>{caption}</p>
      <iframe
        src={src}
        title={title}
        onLoad={() => setLoaded(true)}
        allow="fullscreen; encrypted-media; picture-in-picture; autoplay"
        style={{ width: '100%', maxWidth: 560, aspectRatio: '16 / 9', border: '1px solid rgba(128,128,128,0.4)', borderRadius: 6 }}
      />
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
        request — an administrator approves which origins this app may embed, and the browser
        enforces that approval. Until then, or under a policy that omits it, the frame below stays
        empty.
      </p>

      <Frame
        title="Declared provider"
        src={DECLARED_EMBED}
        caption="Loads only where an administrator approved this origin for this app."
      />

      <Frame
        title="Undeclared origin"
        src={UNDECLARED_ORIGIN}
        caption="Never declared by this app. Under an enforced policy this must not load."
      />

      <h3 style={{ marginBottom: 6 }}>Blocked by policy</h3>
      {frameViolations.length === 0 ? (
        <p style={{ opacity: 0.7, fontSize: 13, marginTop: 0 }}>
          No frame blocked so far. In a workspace with no policy enforced, nothing is blocked and both
          frames may load.
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
        Note: app interfaces render in a sandboxed frame with an opaque origin. Approving an origin
        permits it; some providers still decline to render without cookie or storage access.
      </p>
    </div>
  );
}
