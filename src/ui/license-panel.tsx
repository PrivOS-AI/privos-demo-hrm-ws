import { useMemo, useState } from 'react';
import { usePrivosApp } from '@privos/app-react';

type UiLicense = { tier: 'free' | 'pro'; state?: 'active' | 'lapsed' };

function useLicense(): UiLicense {
  return useMemo(() => {
    const injected = (window as any).__PRIVOS_APP_LICENSE__;
    if (!injected || injected.state === 'lapsed') return { tier: 'free', state: injected?.state };
    return { tier: injected.tier === 'pro' ? 'pro' : 'free', state: 'active' };
  }, []);
}

export default function LicensePanel() {
  const app = usePrivosApp();
  const license = useLicense();
  const [message, setMessage] = useState('');
  const isPro = license.tier === 'pro';

  async function exportSample() {
    setMessage('');
    try {
      const result = await app.callServerTool({
        name: 'hr_bulk_export',
        arguments: { records: [{ name: 'Example employee' }] },
      });
      setMessage(`Export ready: ${result?.content?.[0]?.text || '1 record'}`);
    } catch (error: any) {
      setMessage(error?.message || 'Export failed');
    }
  }

  return (
    <section className="container">
      <h2>License tiers</h2>
      <p>
        Effective tier: <strong>{license.tier}</strong>
        {license.state === 'lapsed' ? ' (paid license lapsed; safely degraded to free)' : ''}
      </p>
      {isPro ? (
        <button type="button" onClick={exportSample}>Bulk export sample</button>
      ) : (
        <p className="empty-text">
          Bulk export is available on Pro. Existing records remain readable and are never deleted on lapse.
        </p>
      )}
      {message && <p>{message}</p>}
    </section>
  );
}
