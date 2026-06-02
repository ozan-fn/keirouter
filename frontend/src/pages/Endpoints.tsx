import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Network,
  Copy,
  Check,
  Monitor,
  Lock,
  Radar,
  KeyRound,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  ExternalLink,
  Shield,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  api,
  type AccessSettings,
  type APIKey,
  type CreatedKey,
  type TunnelCombinedStatus,
  type TailscaleCheckResult,
  type TailscaleEnableResult,
} from "../lib/api";
import { PageHeader } from "../components/Layout";
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
  Toggle,
} from "../components/ui";

// Polling intervals (ms).
const STATUS_POLL_FAST = 5000;
const STATUS_POLL_SLOW = 30000;
const PING_INTERVAL = 2000;
const PING_TIMEOUT = 5000;
const PING_MAX_MS = 300000;
const REACHABLE_MISS_THRESHOLD = 5;

export function EndpointsPage() {
  return (
    <>
      <PageHeader
        title="Endpoints"
        icon={Network}
        description="Configure how KeiRouter connects to your application."
      />
      <div className="space-y-6">
        <PrimaryEndpoint />
        <SecureTunnel />
        <TailscaleFunnel />
        <APIKeys />
      </div>
    </>
  );
}

// ---- primary endpoint -------------------------------------------------------

function PrimaryEndpoint() {
  const access = useQuery({ queryKey: ["access-settings"], queryFn: () => api.accessSettings() });
  const [copied, setCopied] = useState(false);
  const url = access.data?.endpoint_url ?? "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // no-op
    }
  };

  return (
    <Card>
      <SectionHeader
        title="Primary endpoint"
        description="The main API endpoint your app uses to connect to KeiRouter."
        icon={Network}
      />
      <div className="border-t border-[var(--border)] px-6 py-5">
        <Field label="Endpoint URL">
          <div className="flex items-center gap-2">
            <Input value={url} readOnly className="font-mono" />
            <Button variant="ghost" onClick={copy} className="shrink-0">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </Field>
      </div>
    </Card>
  );
}

// ---- secure tunnel (Cloudflare) --------------------------------------------

function SecureTunnel() {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const missRef = useRef(0);
  const pingTimerRef = useRef<ReturnType<typeof setInterval>>();
  const pollTimerRef = useRef<ReturnType<typeof setInterval>>();

  const status = useQuery({
    queryKey: ["tunnel-status"],
    queryFn: () => api.tunnelStatus(),
    refetchInterval: STATUS_POLL_SLOW,
  });

  const tunnel = status.data?.tunnel;
  const download = status.data?.download;
  const tunnelUrl = tunnel?.tunnelUrl || "";
  const publicUrl = tunnel?.publicUrl || "";
  const isRunning = tunnel?.running ?? false;
  const isEnabled = tunnel?.settingsEnabled ?? false;

  // Browser-side health ping.
  const pingTunnel = useCallback(async () => {
    const url = publicUrl || tunnelUrl;
    if (!url) return;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT);
      const res = await fetch(`${url}/healthz`, { mode: "cors", signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        setReachable(true);
        missRef.current = 0;
      } else {
        missRef.current++;
        if (missRef.current >= REACHABLE_MISS_THRESHOLD) setReachable(false);
      }
    } catch {
      missRef.current++;
      if (missRef.current >= REACHABLE_MISS_THRESHOLD) setReachable(false);
    }
  }, [publicUrl, tunnelUrl]);

  // Start/stop ping based on tunnel state.
  useEffect(() => {
    if (isRunning && (publicUrl || tunnelUrl)) {
      pingTunnel();
      pingTimerRef.current = setInterval(pingTunnel, PING_INTERVAL);
      const stopAt = Date.now() + PING_MAX_MS;
      const check = setInterval(() => {
        if (Date.now() > stopAt) {
          clearInterval(pingTimerRef.current);
          clearInterval(check);
        }
      }, 10000);
      return () => {
        clearInterval(pingTimerRef.current);
        clearInterval(check);
      };
    } else {
      setReachable(null);
      missRef.current = 0;
    }
  }, [isRunning, publicUrl, tunnelUrl, pingTunnel]);

  // Fast poll during enable.
  useEffect(() => {
    if (loading) {
      pollTimerRef.current = setInterval(() => qc.invalidateQueries({ queryKey: ["tunnel-status"] }), STATUS_POLL_FAST);
      return () => clearInterval(pollTimerRef.current);
    }
  }, [loading, qc]);

  const enable = useMutation({
    mutationFn: () => api.tunnelEnable(),
    onMutate: () => setLoading(true),
    onSuccess: () => {
      setLoading(false);
      qc.invalidateQueries({ queryKey: ["tunnel-status"] });
      qc.invalidateQueries({ queryKey: ["access-settings"] });
    },
    onError: () => setLoading(false),
  });

  const disable = useMutation({
    mutationFn: () => api.tunnelDisable(),
    onSuccess: () => {
      setReachable(null);
      qc.invalidateQueries({ queryKey: ["tunnel-status"] });
      qc.invalidateQueries({ queryKey: ["access-settings"] });
    },
  });

  const displayUrl = publicUrl || tunnelUrl;

  return (
    <Card>
      <SectionHeader
        title="Secure tunnel"
        description="Expose KeiRouter to the internet via a Cloudflare quick tunnel. No account needed."
        icon={Lock}
      />
      <div className="border-t border-[var(--border)] px-6 py-5 space-y-4">
        {/* Status row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusDot active={isRunning} reachable={reachable} />
            <div>
              <p className="text-sm font-medium">
                {loading ? "Connecting…" : isRunning ? "Tunnel active" : "Tunnel inactive"}
              </p>
              {isRunning && displayUrl && (
                <a
                  href={displayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 flex items-center gap-1 font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  {displayUrl}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {download?.downloading && (
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Downloading cloudflared… {download.progress}%
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <Badge tone={reachable === true ? "success" : reachable === false ? "danger" : "neutral"}>
                {reachable === true ? "Reachable" : reachable === false ? "Unreachable" : "Checking…"}
              </Badge>
            )}
            {isRunning ? (
              <Button variant="danger" onClick={() => disable.mutate()} disabled={disable.isPending}>
                {disable.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disable"}
              </Button>
            ) : (
              <Button onClick={() => enable.mutate()} disabled={loading || enable.isPending}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---- tailscale funnel -------------------------------------------------------

function TailscaleFunnel() {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [sudoPassword, setSudoPassword] = useState("");
  const [installLog, setInstallLog] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const missRef = useRef(0);
  const pingTimerRef = useRef<ReturnType<typeof setInterval>>();

  const status = useQuery({
    queryKey: ["tunnel-status"],
    queryFn: () => api.tunnelStatus(),
    refetchInterval: STATUS_POLL_SLOW,
  });

  const tsCheck = useQuery({
    queryKey: ["tailscale-check"],
    queryFn: () => api.tailscaleCheck(),
    refetchInterval: STATUS_POLL_SLOW,
  });

  const ts = status.data?.tailscale;
  const isRunning = ts?.running ?? false;
  const isLoggedIn = ts?.loggedIn ?? false;
  const isInstalled = tsCheck.data?.installed ?? false;
  const tunnelUrl = ts?.tunnelUrl || "";

  // Browser-side health ping.
  const pingTailscale = useCallback(async () => {
    if (!tunnelUrl) return;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT);
      const res = await fetch(`${tunnelUrl}/healthz`, { mode: "cors", signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        setReachable(true);
        missRef.current = 0;
      } else {
        missRef.current++;
        if (missRef.current >= REACHABLE_MISS_THRESHOLD) setReachable(false);
      }
    } catch {
      missRef.current++;
      if (missRef.current >= REACHABLE_MISS_THRESHOLD) setReachable(false);
    }
  }, [tunnelUrl]);

  useEffect(() => {
    if (isRunning && tunnelUrl) {
      pingTailscale();
      pingTimerRef.current = setInterval(pingTailscale, PING_INTERVAL);
      return () => clearInterval(pingTimerRef.current);
    } else {
      setReachable(null);
    }
  }, [isRunning, tunnelUrl, pingTailscale]);

  // Install Tailscale via SSE.
  const handleInstall = async () => {
    setInstalling(true);
    setInstallLog([]);
    try {
      const res = await fetch("/api/tunnel/tailscale-install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sudoPassword }),
      });
      if (!res.ok || !res.body) {
        setInstallLog((prev) => [...prev, "Failed to start install"]);
        setInstalling(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            const event = line.slice(7);
            const dataLine = lines[lines.indexOf(line) + 1];
            if (dataLine?.startsWith("data: ")) {
              try {
                const data = JSON.parse(dataLine.slice(6));
                if (event === "progress") {
                  setInstallLog((prev) => [...prev, data.message]);
                } else if (event === "done") {
                  setInstallLog((prev) => [...prev, "Installation complete!"]);
                  setInstalling(false);
                  qc.invalidateQueries({ queryKey: ["tailscale-check"] });
                } else if (event === "error") {
                  setInstallLog((prev) => [...prev, `Error: ${data.error}`]);
                  setInstalling(false);
                }
              } catch { /* ignore parse errors */ }
            }
          }
        }
      }
    } catch (e) {
      setInstallLog((prev) => [...prev, `Error: ${(e as Error).message}`]);
      setInstalling(false);
    }
  };

  // Enable Tailscale funnel.
  const enable = useMutation({
    mutationFn: () => api.tailscaleEnable(sudoPassword || undefined),
    onMutate: () => setLoading(true),
    onSuccess: (data: TailscaleEnableResult) => {
      setLoading(false);
      if (data.needsLogin && data.authUrl) {
        setAuthUrl(data.authUrl);
        window.open(data.authUrl, "_blank", "width=600,height=700");
      } else if (data.funnelNotEnabled && data.enableUrl) {
        window.open(data.enableUrl, "_blank", "width=600,height=700");
      } else if (data.success) {
        setAuthUrl(null);
        qc.invalidateQueries({ queryKey: ["tunnel-status"] });
        qc.invalidateQueries({ queryKey: ["access-settings"] });
      }
    },
    onError: () => setLoading(false),
  });

  const disable = useMutation({
    mutationFn: () => api.tailscaleDisable(),
    onSuccess: () => {
      setReachable(null);
      qc.invalidateQueries({ queryKey: ["tunnel-status"] });
      qc.invalidateQueries({ queryKey: ["access-settings"] });
    },
  });

  // Not installed state.
  if (!isInstalled) {
    return (
      <Card>
        <SectionHeader
          title="Tailscale"
          description="Access KeiRouter over your private Tailscale network with HTTPS."
          icon={Radar}
        />
        <div className="border-t border-[var(--border)] px-6 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <WifiOff className="h-5 w-5 text-[var(--text-muted)]" />
            <p className="text-sm">Tailscale is not installed on this machine.</p>
          </div>
          {showPassword ? (
            <div className="space-y-3">
              <Field label="Sudo password (required for installation)">
                <Input
                  type="password"
                  value={sudoPassword}
                  onChange={(e) => setSudoPassword(e.target.value)}
                  placeholder="Enter sudo password"
                />
              </Field>
              <div className="flex gap-2">
                <Button onClick={handleInstall} disabled={installing || !sudoPassword.trim()}>
                  {installing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Install Tailscale"}
                </Button>
                <Button variant="ghost" onClick={() => setShowPassword(false)}>Cancel</Button>
              </div>
              {installLog.length > 0 && (
                <div className="mt-3 max-h-48 overflow-y-auto rounded-lg bg-ink-950 p-3 font-mono text-xs text-ink-300">
                  {installLog.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Button onClick={() => setShowPassword(true)}>Install Tailscale</Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        title="Tailscale"
        description="Access KeiRouter over your private Tailscale network with HTTPS."
        icon={Radar}
      />
      <div className="border-t border-[var(--border)] px-6 py-5 space-y-4">
        {/* Status row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusDot active={isRunning} reachable={reachable} />
            <div>
              <p className="text-sm font-medium">
                {loading ? "Connecting…" : isRunning ? "Funnel active" : isLoggedIn ? "Logged in" : "Not connected"}
              </p>
              {isRunning && tunnelUrl && (
                <a
                  href={tunnelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 flex items-center gap-1 font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  {tunnelUrl}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {!isLoggedIn && (
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Log in to your Tailscale account to use the funnel.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <Badge tone={reachable === true ? "success" : reachable === false ? "danger" : "neutral"}>
                {reachable === true ? "Reachable" : reachable === false ? "Unreachable" : "Checking…"}
              </Badge>
            )}
            {isRunning ? (
              <Button variant="danger" onClick={() => disable.mutate()} disabled={disable.isPending}>
                {disable.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disable"}
              </Button>
            ) : (
              <Button onClick={() => enable.mutate()} disabled={loading || enable.isPending}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable"}
              </Button>
            )}
          </div>
        </div>

        {/* Auth URL notice */}
        {authUrl && (
          <div className="rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 dark:border-accent-800/50 dark:bg-accent-800/20">
            <p className="text-xs font-medium text-accent-700 dark:text-accent-200">
              Tailscale login required.{" "}
              <a href={authUrl} target="_blank" rel="noopener noreferrer" className="underline">
                Click here to authenticate
              </a>
            </p>
          </div>
        )}

        {/* Sudo password for enable */}
        {!isRunning && isLoggedIn && (
          <Field label="Sudo password (optional, for TUN mode)">
            <Input
              type="password"
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
              placeholder="Leave empty for userspace networking"
            />
          </Field>
        )}
      </div>
    </Card>
  );
}

// ---- status dot component ---------------------------------------------------

function StatusDot({ active, reachable }: { active: boolean; reachable: boolean | null }) {
  const color = active
    ? reachable === true
      ? "bg-green-500"
      : reachable === false
        ? "bg-red-500"
        : "bg-yellow-500 animate-pulse"
    : "bg-ink-300 dark:bg-ink-600";
  return <span className={`block h-3 w-3 rounded-full ${color}`} />;
}

// ---- API keys ---------------------------------------------------------------

function APIKeys() {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ["keys"], queryFn: () => api.listKeys() });
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => api.createKey(name),
    onSuccess: (data) => {
      setCreated(data);
      setName("");
      setError("");
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["keys"] }),
  });

  const toggleDisabled = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) => api.updateKey(id, { disabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["keys"] }),
  });

  return (
    <Card>
      <CardHeader
        title="API keys"
        description="Create and manage API keys for authenticating your applications."
      />
      <div className="space-y-4 px-6 py-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Key name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production key"
              className="w-56"
            />
          </Field>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            <Plus className="h-4 w-4" />
            {create.isPending ? "Creating…" : "Create key"}
          </Button>
          {error && <span className="text-xs text-[color:var(--color-danger)]">{error}</span>}
        </div>

        {created && (
          <div className="rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 dark:border-accent-800/50 dark:bg-accent-800/20">
            <p className="text-xs font-medium text-accent-700 dark:text-accent-200">
              Copy this key now — it won't be shown again.
            </p>
            <code className="mt-1.5 block break-all font-mono text-sm">{created.key}</code>
          </div>
        )}
      </div>

      {keys.isLoading ? (
        <Spinner />
      ) : !keys.data?.keys.length ? (
        <EmptyState title="No API keys yet" hint="Create a key to authenticate your app." />
      ) : (
        <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {keys.data.keys.map((k) => (
            <KeyRow key={k.id} k={k} onDelete={() => remove.mutate(k.id)} onToggle={() => toggleDisabled.mutate({ id: k.id, disabled: !k.disabled })} />
          ))}
        </div>
      )}
    </Card>
  );
}

function KeyRow({ k, onDelete, onToggle }: { k: APIKey; onDelete: () => void; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
          <KeyRound className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="text-sm font-medium">{k.name}</p>
          <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">{k.display}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={k.disabled ? "neutral" : "success"}>{k.disabled ? "Disabled" : "Active"}</Badge>
        <Button variant="ghost" onClick={onToggle} className="px-2" title={k.disabled ? "Enable key" : "Disable key"}>
          {k.disabled ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />}
        </Button>
        <Button variant="danger" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
