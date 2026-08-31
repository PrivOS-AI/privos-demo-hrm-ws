/**
 * Embeds panel — demonstrates the workspace's external-embed allowlist.
 *
 * The app *declares* the origins it would like to embed (`tools[].ui.csp['frame-src']` in
 * privos-app.json). That declaration grants nothing: a workspace admin approves the origins
 * this app may actually embed, and the Hub serves this document with a matching `frame-src`
 * Content-Security-Policy. So the same build behaves differently per workspace, which is
 * exactly what this panel makes visible.
 *
 * **Approval alone is not enough, and this panel is the proof.** This document is sandboxed
 * without `allow-same-origin`, so it runs in an opaque origin, and every iframe it creates
 * inherits that sandbox. Providers like YouTube refuse to initialize there — an approved
 * origin still shows an empty box. So an app must not iframe a provider itself; it asks the
 * host to do it, through `useProviderEmbed`. The host re-checks the URL's origin against the
 * admin-approved list (server truth) and renders the frame outside this sandbox, positioned
 * over the placeholder below. Publisher code never runs in that frame.
 *
 * Three cases are rendered on purpose:
 *   - the declared provider through the host — renders once an admin approves it;
 *   - the same provider iframed by the app itself — the pre-hoist behaviour, which stays dead
 *     even when approved, because that is the trap this API exists to remove;
 *   - an origin this app never declared, refused by CSP under enforcement.
 *
 * Anything the browser refuses arrives as a `securitypolicyviolation` event, listed below, so
 * an operator can see the policy working rather than having to infer it from an empty box.
 */
import { useEffect, useState } from 'react';
import { useProviderEmbed } from '@privos_ai/app-react';

/** Declared in the manifest, so an admin can approve it. */
const DECLARED_PROVIDER = 'https://www.youtube.com';
const DECLARED_EMBED = `${DECLARED_PROVIDER}/embed/M7lc1UVf-VE`;

/** Never declared and never approvable through this app — the negative control. */
const UNDECLARED_ORIGIN = 'https://example.com';

const FRAME_STYLE = {
  width: '100%',
  maxWidth: 560,
  aspectRatio: '16 / 9',
  border: '1px solid rgba(128,128,128,0.4)',
  borderRadius: 6,
} as const;

type Violation = { blockedURI: string; directive: string; at: string };

/** Why the host refused, in words an operator can act on. */
const DENIAL_TEXT: Record<string, string> = {
  'origin-not-approved': 'No administrator has approved this origin for this app yet.',
  'invalid-url': 'The requested URL is not a valid absolute https URL.',
  'hub-origin': 'A hoisted frame may never point at the hub itself.',
  'too-many-embeds': 'This app already holds the maximum number of concurrent embeds.',
  'not-ready': 'The host is not ready for embed requests yet.',
};

/** The provider, rendered by the host outside this sandbox. */
function HostedProviderFrame() {
  const { ref, state, reason } = useProviderEmbed(DECLARED_EMBED);

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 4 }}>Declared provider, rendered by the host</h3>
      <p style={{ opacity: 0.75, marginTop: 0, fontSize: 13 }}>
        Requested over the app bridge; the host validates the origin against the approved list and
        renders the frame outside this app&apos;s sandbox.
      </p>
      <div ref={ref} style={{ ...FRAME_STYLE, display: 'grid', placeItems: 'center' }}>
        {state !== 'granted' && (
          <span style={{ fontSize: 13, opacity: 0.75, padding: 12, textAlign: 'center' }}>
            {state === 'requesting' && 'Asking the host to render this provider…'}
            {state === 'denied' && (reason ? DENIAL_TEXT[reason] || `Refused: ${reason}.` : 'Refused by the host.')}
            {state === 'unsupported' && 'This hub predates hoisted embeds, so nothing can render here.'}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Host decision: {state}.</div>
    </div>
  );
}

/** An iframe this document creates itself — kept to show why the hosted path exists. */
function SelfFramed({ title, src, caption }: { title: string; src: string; caption: string }) {
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
        style={FRAME_STYLE}
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
        request — an administrator approves which origins this app may embed. Approval decides
        <em> whether</em> a provider may appear; asking the host to render it decides <em>that</em>
        it can appear at all, because this document&apos;s sandbox kills provider frames it creates
        itself.
      </p>

      <HostedProviderFrame />

      <SelfFramed
        title="Same provider, iframed by the app"
        src={DECLARED_EMBED}
        caption="The pre-hoist approach. Even with the origin approved, the sandbox leaves this empty — which is the whole reason for the hosted path above."
      />

      <SelfFramed
        title="Undeclared origin"
        src={UNDECLARED_ORIGIN}
        caption="Never declared by this app. Under an enforced policy this must not load."
      />

      <h3 style={{ marginBottom: 6 }}>Blocked by policy</h3>
      {frameViolations.length === 0 ? (
        <p style={{ opacity: 0.7, fontSize: 13, marginTop: 0 }}>
          No frame blocked so far. In a workspace with no policy enforced, nothing is blocked and both
          self-framed boxes may load.
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
    </div>
  );
}
