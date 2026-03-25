import { PrivosAppProvider, usePrivosContext } from '@privos/app-react';
import { ThemeProvider, ThemeToggle } from './theme-provider';
import HRManagementDashboard from './contact-collector-form';

function ThemedApp() {
  const { theme } = usePrivosContext();
  return (
    <ThemeProvider hostTheme={theme}>
      <div className="app-header">
        <ThemeToggle />
      </div>
      <HRManagementDashboard />
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <PrivosAppProvider>
      <ThemedApp />
    </PrivosAppProvider>
  );
}
