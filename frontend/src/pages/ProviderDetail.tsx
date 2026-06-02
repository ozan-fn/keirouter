import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Plug, KeyRound, X, Zap, ArrowUp, ArrowDown, CheckCircle, XCircle, ToggleLeft, ToggleRight } from "lucide-react";
import { api, type DeviceCode, type OAuthProvider, type Provider, type Account, type UpstreamQuota } from "../lib/api";
import { KiroConnectModal } from "../components/KiroConnectModal";
import { useToast } from "../components/Toast";
import {
  Card,
  SectionHeader,
  CardHeader,
  Button,
  Input,
  Field,
  Badge,
  Spinner,
  EmptyState,
  ErrorBanner,
} from "../components/ui";

// redirectURI is the OAuth callback the provider returns to (out-of-band flow
// suited to a local dashboard).
const redirectURI = "http://localhost:20180/oauth/callback";

export function ProviderDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();

  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api.providers() });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api.listAccounts() });
  const oauthProviders = useQuery({ queryKey: ["oauth-providers"], queryFn: () => api.oauthProviders() });
  const pools = useQuery({ queryKey: ["proxy-pools"], queryFn: () => api.listProxyPools() });
  const disabledModels = useQuery({
    queryKey: ["disabled-models", id],
    queryFn: () => api.listDisabledModels(id!),
    enabled: !!id,
  });
  const models = useQuery({
    queryKey: ["provider-models", id],
    queryFn: () => api.providerModels(id!),
    enabled: !!id,
    staleTime: 60_000,
  });

  const provider = providers.data?.providers.find((p) => p.id === id);
  const oauthProvider = oauthProviders.data?.providers.find((p) => p.provider === id);
  const myAccounts = (accounts.data?.accounts ?? []).filter((a) => a.provider === id);

  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [region, setRegion] = useState("");
  const [error, setError] = useState("");
  const [oauthOpen, setOauthOpen] = useState(false);
  const [kiroOpen, setKiroOpen] = useState(false);

  // Set default region when provider loads.
  useEffect(() => {
    if (provider?.default_region && !region) {
      setRegion(provider.default_region);
    }
  }, [provider, region]);

  const hasRegions = (provider?.regions?.length ?? 0) > 0;

  const create = useMutation({
    mutationFn: () =>
      api.createAccount({
        provider: id!,
        label,
        api_key: apiKey,
        base_url: baseURL || undefined,
        region: hasRegions ? region : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setLabel("");
      setApiKey("");
      setBaseURL("");
      setError("");
      toast.success("Account added", "Provider account connected.");
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error("Couldn't add account", e.message);
    },
  });

  const remove = useMutation({
    mutationFn: (accountId: string) => api.deleteAccount(accountId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Account removed");
    },
    onError: (e: Error) => toast.error("Couldn't remove account", e.message),
  });

  const updateAccount = useMutation({
    mutationFn: ({ id: accId, patch }: { id: string; patch: { label?: string; priority?: number; disabled?: boolean; proxy_pool_id?: string } }) =>
      api.updateAccount(accId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
    onError: (e: Error) => toast.error("Couldn't update account", e.message),
  });

  const testAccount = useMutation({
    mutationFn: (accountId: string) => api.testAccount(accountId),
    onSuccess: (data) => {
      if (data.status === "ok") {
        toast.success("Account test passed", "Account credentials are valid.");
      } else {
        toast.error("Account test failed", data.message);
      }
    },
    onError: (e: Error) => toast.error("Test failed", e.message),
  });

  const disableModelsMut = useMutation({
    mutationFn: (ids: string[]) => api.disableModels(id!, ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["disabled-models", id] });
      toast.success("Models disabled");
    },
    onError: (e: Error) => toast.error("Couldn't disable models", e.message),
  });

  const enableModelsMut = useMutation({
    mutationFn: (ids: string[]) => api.enableModels(id!, ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["disabled-models", id] });
      toast.success("Models enabled");
    },
    onError: (e: Error) => toast.error("Couldn't enable models", e.message),
  });

  // Sort accounts by priority for display.
  const sortedAccounts = [...myAccounts].sort((a, b) => a.priority - b.priority);
  const disabledModelIds = new Set(disabledModels.data?.ids ?? []);

  const moveAccount = (accId: string, direction: "up" | "down") => {
    const idx = sortedAccounts.findIndex((a) => a.id === accId);
    if (idx < 0) return;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= sortedAccounts.length) return;
    const newPriority = sortedAccounts[target].priority;
    updateAccount.mutate({ id: accId, patch: { priority: newPriority } });
  };

  if (providers.isLoading) return <Spinner />;
  if (!provider) {
    return (
      <Card className="px-6 py-12 text-center">
        <p className="text-sm text-[var(--text-muted)]">Provider not found.</p>
        <Link to="/providers" className="mt-3 inline-block text-sm font-medium text-accent-600">
          Back to Providers
        </Link>
      </Card>
    );
  }

  const isKiro = provider.id === "kiro";
  const supportsApiKey = !isKiro && (provider.auth_modes.includes("api_key") || !oauthProvider);

  return (
    <>
      <Link
        to="/providers"
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Providers
      </Link>

      <header className="mb-7 flex items-start gap-4">
        <ProviderIcon provider={provider} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{provider.display_name}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {myAccounts.length} connected {myAccounts.length === 1 ? "account" : "accounts"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {provider.service_kinds.map((k) => (
              <Badge key={k} tone="accent">
                {k}
              </Badge>
            ))}
            {provider.deprecated && <Badge tone="danger">risk</Badge>}
          </div>
        </div>
      </header>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Connected accounts" />
          {accounts.isLoading ? (
            <Spinner />
          ) : !myAccounts.length ? (
            <EmptyState
              title="No accounts yet"
              hint="Add an account below to start routing through this provider."
            />
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {sortedAccounts.map((a, i) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  index={i}
                  total={sortedAccounts.length}
                  pools={pools.data?.pools ?? []}
                  onDelete={() => remove.mutate(a.id)}
                  onMoveUp={() => moveAccount(a.id, "up")}
                  onMoveDown={() => moveAccount(a.id, "down")}
                  onTest={() => testAccount.mutate(a.id)}
                  onUpdateProxy={(poolId) => updateAccount.mutate({ id: a.id, patch: { proxy_pool_id: poolId } })}
                  testing={testAccount.isPending}
                />
              ))}
            </div>
          )}
        </Card>

        {isKiro && (
          <Card>
            <SectionHeader
              title="Connect with sign-in"
              description="Authenticate with AWS Builder ID, IAM Identity Center, or import a Kiro IDE token."
              icon={Plug}
            />
            <div className="border-t border-[var(--border)] px-6 py-5">
              <Button onClick={() => setKiroOpen(true)}>
                <Plug className="h-4 w-4" />
                Connect Kiro
              </Button>
            </div>
          </Card>
        )}

        {!isKiro && oauthProvider && (
          <Card>
            <SectionHeader
              title="Connect with sign-in"
              description={flowLabel(oauthProvider.flow)}
              icon={Plug}
            />
            <div className="border-t border-[var(--border)] px-6 py-5">
              <Button onClick={() => setOauthOpen(true)}>
                <Plug className="h-4 w-4" />
                Connect {provider.display_name}
              </Button>
            </div>
          </Card>
        )}

        {supportsApiKey && (
          <Card>
            <SectionHeader
              title="Add account with API key"
              description="API keys are encrypted at rest and never shown again."
              icon={KeyRound}
            />
            <form
              className="grid grid-cols-1 gap-4 border-t border-[var(--border)] px-6 py-5 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (apiKey) create.mutate();
              }}
            >
              <Field label="Label">
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="personal" />
              </Field>
              <Field label="API key">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  required
                />
              </Field>
              {hasRegions ? (
                <Field label="Region">
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm transition-colors focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
                  >
                    {provider!.regions!.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Base URL (optional)">
                  <Input
                    value={baseURL}
                    onChange={(e) => setBaseURL(e.target.value)}
                    placeholder="for custom endpoints"
                  />
                </Field>
              )}
              {error && (
                <div className="sm:col-span-2">
                  <ErrorBanner message={error} />
                </div>
              )}
              <div className="flex items-end justify-end gap-3 sm:col-span-2">
                <Button type="submit" disabled={create.isPending || !apiKey}>
                  <Plus className="h-4 w-4" />
                  {create.isPending ? "Adding…" : "Add account"}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Available Models */}
        {models.data && models.data.models.length > 0 && (
          <Card>
            <CardHeader
              title="Available Models"
              description={`${models.data.models.length} model${models.data.models.length === 1 ? "" : "s"} configured for this provider.`}
            />
            <div className="flex items-center gap-2 border-t border-[var(--border)] px-6 py-3">
              <Button
                variant="ghost"
                onClick={() => enableModelsMut.mutate(models.data!.models.map((m) => m.id))}
                disabled={enableModelsMut.isPending}
              >
                <ToggleRight className="h-4 w-4" />
                Enable all
              </Button>
              <Button
                variant="ghost"
                onClick={() => disableModelsMut.mutate(models.data!.models.map((m) => m.id))}
                disabled={disableModelsMut.isPending}
              >
                <ToggleLeft className="h-4 w-4" />
                Disable all
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-[var(--border)] px-6 py-5">
              {models.data.models.map((m) => (
                <ModelChip
                  key={m.id}
                  model={m}
                  provider={provider}
                  disabled={disabledModelIds.has(m.id)}
                  onToggleDisable={() => {
                    if (disabledModelIds.has(m.id)) {
                      enableModelsMut.mutate([m.id]);
                    } else {
                      disableModelsMut.mutate([m.id]);
                    }
                  }}
                />
              ))}
            </div>
          </Card>
        )}
      </div>

      {oauthOpen && oauthProvider && (
        <ConnectModal provider={oauthProvider} onClose={() => setOauthOpen(false)} />
      )}
      {kiroOpen && <KiroConnectModal onClose={() => setKiroOpen(false)} />}
    </>
  );
}

function AccountRow({
  account: a,
  index,
  total,
  pools,
  onDelete,
  onMoveUp,
  onMoveDown,
  onTest,
  onUpdateProxy,
  testing,
}: {
  account: Account;
  index: number;
  total: number;
  pools: { id: string; name: string }[];
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onTest: () => void;
  onUpdateProxy: (poolId: string) => void;
  testing: boolean;
}) {
  const quota = useQuery({
    queryKey: ["account-quota", a.id],
    queryFn: () => api.accountQuota(a.id),
    staleTime: 60_000,
    enabled: !a.disabled,
  });

  const hasQuota = quota.data?.supported && quota.data?.quotas && quota.data.quotas.length > 0;

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{a.label || a.provider}</span>
            <Badge tone="neutral">{a.auth_kind === "oauth" ? "OAuth" : "API key"}</Badge>
            {a.disabled && <Badge tone="danger">disabled</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">priority {a.priority}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" onClick={onMoveUp} disabled={index === 0} className="px-2">
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={onMoveDown} disabled={index === total - 1} className="px-2">
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={onTest} disabled={testing} className="px-2">
            <CheckCircle className={`h-4 w-4 ${testing ? "animate-pulse" : ""}`} />
          </Button>
          <Button variant="danger" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {pools.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">Proxy pool:</span>
          <select
            value={a.proxy_pool_id || ""}
            onChange={(e) => onUpdateProxy(e.target.value || "")}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
          >
            <option value="">None</option>
            {pools.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Quota / credit info integrated into account row */}
      {hasQuota && quota.data && (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5">
          <div className="mb-2 flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span className="text-xs font-medium text-[var(--text)]">
              {quota.data.plan_name ? `${quota.data.plan_name} — Credits` : "Credits & Quota"}
            </span>
            {quota.data.plan_name && (
              <Badge tone="accent">{quota.data.plan_name}</Badge>
            )}
          </div>
          {quota.data.message && (
            <p className="mb-2 text-[11px] text-[var(--text-muted)]">{quota.data.message}</p>
          )}
          {quota.data.quotas && (
            <div className="space-y-2">
              {quota.data.quotas.map((q) => (
                <QuotaBarInline key={q.resource_type} quota={q} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuotaBarInline({ quota: q }: { quota: UpstreamQuota }) {
  const pct = q.limit > 0 ? Math.min(100, Math.round((q.used / q.limit) * 100)) : 0;
  const remainingPct = q.limit > 0 ? Math.round((q.remaining / q.limit) * 100) : 0;
  const tone =
    remainingPct < 30
      ? "bg-[color:var(--color-danger)]"
      : remainingPct < 70
        ? "bg-[color:var(--color-warning)]"
        : "bg-accent-500";
  const label = q.resource_type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const resetDate = q.reset_at ? new Date(q.reset_at) : null;
  const resetLabel = resetDate && !isNaN(resetDate.getTime())
    ? resetDate.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium text-[var(--text)]">{label}</span>
        <div className="flex items-center gap-2">
          {resetLabel && (
            <span className="text-[10px] text-[var(--text-muted)]">resets {resetLabel}</span>
          )}
          <span className="tabular-nums">
            {q.used.toLocaleString()} / {q.limit.toLocaleString()}
            <span className="ml-1 text-[var(--text-muted)]">({q.remaining.toLocaleString()} left)</span>
          </span>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}

function flowLabel(flow: string): string {
  switch (flow) {
    case "device_code":
      return "Device code — enter a code on the provider site.";
    case "authorization_code_pkce":
      return "Browser sign-in (PKCE).";
    default:
      return "Browser sign-in.";
  }
}

// ---- OAuth connect modal (reused flow) --------------------------------------

function ConnectModal({ provider, onClose }: { provider: OAuthProvider; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-float)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-sm font-semibold">Connect {provider.display_name}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-ink-100 hover:text-[var(--text)]"
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

function AuthCodeFlow({ provider, onClose }: { provider: OAuthProvider; onClose: () => void }) {
  const qc = useQueryClient();
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
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setTimeout(onClose, 1200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) return <div className="px-6 py-6 text-sm">Connected. Refreshing accounts…</div>;

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

function DeviceFlow({ provider, onClose }: { provider: OAuthProvider; onClose: () => void }) {
  const qc = useQueryClient();
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
          qc.invalidateQueries({ queryKey: ["accounts"] });
          setTimeout(onClose, 1200);
          return;
        }
        poll(deviceCode, res.slow_down ? interval + 5 : interval);
      } catch (e) {
        setError((e as Error).message);
        setStatus("error");
      }
    }, Math.max(1, interval) * 1000);
  };

  if (status === "done") return <div className="px-6 py-6 text-sm">Connected. Refreshing accounts…</div>;

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
            className="block w-full rounded-xl bg-accent-600 px-3 py-2 text-center text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-700"
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

// ---- Account quota card -----------------------------------------------------


// ModelChip renders a single model as a compact chip showing the model ID and
// display name (matching 9router's ModelRow pattern).
function ModelChip({
  model,
  provider,
  disabled,
  onToggleDisable,
}: {
  model: { id: string; name: string; kind: string };
  provider: Provider;
  disabled?: boolean;
  onToggleDisable?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const fullModel = `${provider.alias || provider.id}/${model.id}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullModel);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`group flex min-w-0 max-w-full items-start gap-2 rounded-lg border px-3 py-2 transition-colors hover:bg-ink-50 ${disabled ? "border-[color:var(--color-danger)]/30 opacity-60" : "border-[var(--border)]"}`}>
      <span className="mt-0.5 text-[var(--text-muted)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
        </svg>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <code className="truncate font-mono text-xs text-[var(--text)]">{fullModel}</code>
        {model.name && model.name !== model.id && (
          <span className="truncate text-[10px] italic text-[var(--text-muted)]">{model.name}</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {onToggleDisable && (
          <button
            onClick={onToggleDisable}
            className="shrink-0 rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-ink-100 hover:text-[var(--text)]"
            title={disabled ? "Enable model" : "Disable model"}
          >
            {disabled ? <XCircle className="h-3.5 w-3.5 text-[color:var(--color-danger)]" /> : <CheckCircle className="h-3.5 w-3.5 text-accent-500" />}
          </button>
        )}
        <button
          onClick={handleCopy}
          className="shrink-0 rounded p-0.5 text-[var(--text-muted)] opacity-100 transition-opacity hover:bg-ink-100 hover:text-[var(--text)] sm:opacity-0 sm:group-hover:opacity-100"
          title="Copy model path"
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ProviderIcon renders the provider PNG with a colored fallback initial.
function ProviderIcon({ provider: p, size = 40 }: { provider: Provider; size?: number }) {
  const [errored, setErrored] = useState(false);
  const dim = { width: size, height: size };
  if (errored || !p.icon) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white"
        style={{ ...dim, backgroundColor: p.color || "#64748b" }}
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
      className="shrink-0 rounded-2xl object-contain"
      style={dim}
    />
  );
}