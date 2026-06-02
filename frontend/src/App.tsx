import { Routes, Route } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { Layout } from "./components/Layout";
import { OverviewPage } from "./pages/Overview";
import { ProvidersPage } from "./pages/Providers";
import { ProviderDetailPage } from "./pages/ProviderDetail";
import { ChainsPage } from "./pages/Chains";
import { KeysPage } from "./pages/Keys";
import { BudgetsPage } from "./pages/Budgets";
import { SettingsPage } from "./pages/Settings";
import { EndpointsPage } from "./pages/Endpoints";
import { UsagePage } from "./pages/Usage";
import { QuotaPage } from "./pages/Quota";
import { CLIToolsPage } from "./pages/CLITools";
import { CLIToolDetailPage } from "./pages/CLIToolDetail";
import { MediaProvidersPage } from "./pages/MediaProviders";
import { MediaProviderDetailPage } from "./pages/MediaProviderDetail";
import { ProxyPoolsPage } from "./pages/ProxyPools";
import { SkillsPage } from "./pages/Skills";
import { ConsoleLogPage } from "./pages/ConsoleLog";
import { OAuthCallbackPage } from "./pages/OAuthCallback";

export function App() {
  return (
    <AuthGate>
      <Routes>
        {/* OAuth callback — standalone page, no sidebar layout */}
        <Route path="oauth/callback" element={<OAuthCallbackPage />} />
        <Route element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="providers" element={<ProvidersPage />} />
          <Route path="providers/:id" element={<ProviderDetailPage />} />
          <Route path="endpoints" element={<EndpointsPage />} />
          <Route path="chains" element={<ChainsPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="quota" element={<QuotaPage />} />
          <Route path="cli-tools" element={<CLIToolsPage />} />
          <Route path="cli-tools/:toolId" element={<CLIToolDetailPage />} />
          <Route path="media" element={<MediaProvidersPage />} />
          <Route path="media/:kind" element={<MediaProvidersPage />} />
          <Route path="media/:kind/:id" element={<MediaProviderDetailPage />} />
          <Route path="proxy-pools" element={<ProxyPoolsPage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="console" element={<ConsoleLogPage />} />
          <Route path="keys" element={<KeysPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </AuthGate>
  );
}