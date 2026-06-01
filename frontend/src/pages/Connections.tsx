import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plug, X } from "lucide-react";
import { api, type DeviceCode, type OAuthProvider } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { Card, CardHeader, Button, Input, Field, Spinner, EmptyState } from "../components/ui";

// redirectURI is the OAuth callback the provider returns to. The provider
// redirects here with ?code=...; the user copies the code from the address bar
// and pastes it back (an out-of-band style flow suited to a local dashboard).
const redirectURI = "http://localhost:20180/oauth/callback";

export function ConnectionsPage() {
  const oauthProviders = useQuery({ queryKey: ["oauth-providers"], queryFn: () => api.oauthProviders() });
  const [active, setActive] = useState<OAuthProvider | null>(null);

  return (
    <>
      <PageHeader
        title="Connections"
        icon={Plug}
        description="Connect subscription/OAuth providers without an API key. Tokens are encrypted at rest and refreshed automatically."
      />

      <Card>
        <CardHeader title="OAuth providers" description="Choose a provider to start a sign-in flow." />
        {oauthProviders.isLoading ? (
          <Spinner />
        ) : !oauthProviders.data?.providers.length ? (
          <EmptyState title="No OAuth providers available" />
        ) : (
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-b-2xl bg-[var(--border)] sm:grid-cols-2">
            {oauthProviders.data.providers.map((p) => (
              <button
                key={p.provider}
                onClick={() => setActive(p)}
                className="flex items-center gap-3 bg-[var(--bg-elevated)] px-5 py-4 text-left transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/50"
              >
                <ProviderIcon provider={p} />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{p.display_name}</span>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{flowLabel(p.flow)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {active && <ConnectModal provider={active} onClose={() => setActive(null)} />}
    </>
  );
}

function flowLabel(flow: string): string {
  switch (flow) {
    case "device_code":
      return "Device code — enter a code on the provider site";
    case "authorization_code_pkce":
      return "Browser sign-in (PKCE)";
    default:
      return "Browser sign-in";
  }
}

// ConnectModal drives one OAuth flow, branching by the provider's flow type.
function ConnectModal({ provider, onClose }: { provider: OAuthProvider; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-float)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center gap-3">
            <ProviderIcon provider={provider} />
            <h2 className="text-sm font-semibold">Connect {provider.display_name}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-ink-100 hover:text-[var(--text)] dark:hover:bg-ink-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {provider.flow === "device_code" ? (
          <DeviceFlow provider={provider} onClose={onClose} />
        ) : (
          <AuthCodeFlow provider={provider} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

// AuthCodeFlow: open the provider authorize URL, then paste the returned code.
function AuthCodeFlow({ provider, onClose }: { provider: OAuthProvider; onClose: () => void }) {
  const [state, setState] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const start = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await api.oauthAuthorize(provider.provider, redirectURI);
      setState(res.state);
      window.open(res.authorize_url, "_blank", "noopener");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setError("");
    setBusy(true);
    try {
      await api.oauthExchange(provider.provider, { code: code.trim(), state });
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return <div className="px-6 py-6 text-sm text-[var(--text)]">Connected. Refreshing accounts…</div>;
  }

  return (
    <div className="space-y-4 px-6 py-5">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--text-muted)]">
        <li>Click "Open sign-in" to authorize in your browser.</li>
        <li>After approving, copy the code from the redirect URL.</li>
        <li>Paste it below and finish.</li>
      </ol>

      {!state ? (
        <Button onClick={start} disabled={busy} className="w-full">
          {busy ? "Starting…" : "Open sign-in"}
        </Button>
      ) : (
        <>
          <Field label="Authorization code">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="paste code here" />
          </Field>
          <Button onClick={finish} disabled={busy || !code.trim()} className="w-full">
            {busy ? "Connecting…" : "Finish connection"}
          </Button>
        </>
      )}

      {error && <p className="text-xs text-[color:var(--color-danger)]">{error}</p>}
    </div>
  );
}

// DeviceFlow: request a device code, show it, and poll until authorized.
function DeviceFlow({ provider, onClose }: { provider: OAuthProvider; onClose: () => void }) {
  const [dc, setDc] = useState<DeviceCode | null>(null);
  const [status, setStatus] = useState<"idle" | "waiting" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const start = async () => {
    setError("");
    try {
      const res = await api.oauthDeviceCode(provider.provider);
      setDc(res);
      setStatus("waiting");
      poll(res.device_code, res.interval);
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  };

  const poll = (deviceCode: string, interval: number) => {
    pollRef.current = setTimeout(async () => {
      try {
        const res = await api.oauthPoll(provider.provider, deviceCode);
        if (res.status === "complete") {
          setStatus("done");
          setTimeout(onClose, 1200);
          return;
        }
        // pending: keep polling, backing off on slow_down.
        poll(deviceCode, res.slow_down ? interval + 5 : interval);
      } catch (e) {
        setError((e as Error).message);
        setStatus("error");
      }
    }, Math.max(1, interval) * 1000);
  };

  if (status === "done") {
    return <div className="px-6 py-6 text-sm text-[var(--text)]">Connected. Refreshing accounts…</div>;
  }

  return (
    <div className="space-y-4 px-6 py-5">
      {!dc ? (
        <>
          <p className="text-sm text-[var(--text-muted)]">
            A device code will be generated. Enter it on the provider's verification page to authorize.
          </p>
          <Button onClick={start} className="w-full">
            Generate device code
          </Button>
        </>
      ) : (
        <>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-4 text-center">
            <p className="text-xs text-[var(--text-muted)]">Your code</p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-widest">{dc.user_code}</p>
          </div>
          <a
            href={dc.verification_uri_complete || dc.verification_uri}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-lg bg-accent-600 px-3 py-2 text-center text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-700"
          >
            Open verification page
          </a>
          <p className="text-center text-xs text-[var(--text-muted)]">
            {status === "waiting" ? "Waiting for you to authorize…" : ""}
          </p>
        </>
      )}
      {error && <p className="text-xs text-[color:var(--color-danger)]">{error}</p>}
    </div>
  );
}

// ProviderIcon renders the provider PNG with a colored fallback initial.
function ProviderIcon({ provider: p }: { provider: OAuthProvider }) {
  const [errored, setErrored] = useState(false);
  if (errored || !p.icon) {
    return (
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
        style={{ backgroundColor: p.color || "#64748b" }}
      >
        {p.display_name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={p.icon}
      alt={p.display_name}
      onError={() => setErrored(true)}
      className="h-10 w-10 shrink-0 rounded-xl object-contain"
    />
  );
}