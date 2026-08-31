/**
 * Catches a failed lazy `import()` of a panel chunk — the browser has the
 * shell cached but the hashed chunk it references is gone (upgrade swapped
 * the installation generation, or the Hub's asset cache was flushed for a
 * generation this tab still references). React's own error boundary
 * contract is the only way to intercept a rejected dynamic import inside a
 * component tree; a plain try/catch around `React.lazy` cannot, since the
 * throw happens during render, not at call time.
 *
 * Deliberately does not retry the import itself: a stale chunk reference is
 * a shell/asset mismatch that a re-fetch of the (also stale) shell cannot
 * fix, so the fallback asks for a full reload instead.
 */
import { Component, type ReactNode } from 'react';

interface LazyBoundaryProps {
  children: ReactNode;
}

interface LazyBoundaryState {
  hasError: boolean;
}

export class LazyBoundary extends Component<LazyBoundaryProps, LazyBoundaryState> {
  state: LazyBoundaryState = { hasError: false };

  static getDerivedStateFromError(): LazyBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('[LazyBoundary] failed to load an app chunk', error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="container">
          <div className="error-message">
            A new version of this app is available.
          </div>
          <button type="button" className="btn-submit" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default LazyBoundary;
