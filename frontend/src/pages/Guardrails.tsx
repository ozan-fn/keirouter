import { useEffect, useMemo, useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Globe,
  Boxes,
  Layers,
  Cpu,
  Key as KeyIcon,
  ScrollText,
  Plus,
  Trash2,
  Save,
} from "lucide-react";
import {
  api,
  type GuardrailPolicy,
  type GuardrailPolicyConfig,
  type GuardrailScope,
} from "../lib/api";
import { PageHeader } from "../components/Layout";
import { useToast } from "../components/Toast";
import { GuardrailEditor } from "../components/GuardrailEditor";
import { ScopeIDSelector } from "../components/ScopeIDSelector";
import {
  Card,
  CardHeader,
  Button,
  Input,
  Select,
  Field,
  Badge,
  TabBar,
  Toggle,
  Modal,
  EmptyState,
  Spinner,
} from "../components/ui";

type Tab = "global" | "providers" | "models" | "chains" | "apikeys" | "logs";

const TABS = [
  { value: "global" as const, label: "Global", icon: Globe },
  { value: "providers" as const, label: "Providers", icon: Boxes },
  { value: "models" as const, label: "Models", icon: Cpu },
  { value: "chains" as const, label: "Chains", icon: Layers },
  { value: "apikeys" as const, label: "API Keys", icon: KeyIcon },
  { value: "logs" as const, label: "Audit Logs", icon: ScrollText },
];

function useHashTab(defaultTab: Tab): [Tab, (t: Tab) => void] {
  const valid: Tab[] = TABS.map((t) => t.value);
  const read = (): Tab => {
    const h = window.location.hash.replace("#", "");
    return valid.includes(h as Tab) ? (h as Tab) : defaultTab;
  };
  const [tab, setTab] = useState<Tab>(read);
  useEffect(() => {
    const onHash = () => setTab(read);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return [
    tab,
    (t: Tab) => {
      window.history.replaceState(null, "", `#${t}`);
      setTab(t);
    },
  ];
}

const SCOPE_BY_TAB: Record<Exclude<Tab, "logs">, GuardrailScope> = {
  global: "global",
  providers: "provider",
  models: "model",
  chains: "chain",
  apikeys: "apikey",
};

export function GuardrailsPage() {
  const [tab, setTab] = useHashTab("global");

  return (
    <div>
      <PageHeader
        title="Guardrails"
        description="Content-safety policies layered global → provider → model → chain → API key. Most specific wins."
      />
      <div className="mb-4">
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>
      {tab === "logs" ? <LogsTab /> : <ScopeTab scope={SCOPE_BY_TAB[tab]} />}
    </div>
  );
}

function ScopeTab({ scope }: { scope: GuardrailScope }) {
  const qc = useQueryClient();
  const toast = useToast();
  const policies = useQuery({
    queryKey: ["guardrails", scope],
    queryFn: () => api.listGuardrails(scope),
  });

  const [editing, setEditing] = useState<GuardrailPolicy | null>(null);
  const [creating, setCreating] = useState(false);

  const list = policies.data?.guardrails ?? [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-[var(--text-muted)]">
          {scopeDescription(scope)}
        </div>
        {scope !== "global" && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Policy
          </Button>
        )}
        {scope === "global" && list.length === 0 && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create Global Policy
          </Button>
        )}
      </div>

      {policies.isLoading ? (
        <div className="py-8 flex justify-center">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title={`No ${scope} policies yet`}
          hint={
            scope === "global"
              ? "Create one master policy that applies to all traffic."
              : "Add a policy to override the global config for this scope."
          }
        />
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <PolicyRow
              key={p.id}
              policy={p}
              onEdit={() => setEditing(p)}
              onToggle={async (enabled) => {
                await api.updateGuardrail(p.id, { enabled });
                qc.invalidateQueries({ queryKey: ["guardrails"] });
              }}
              onDelete={async () => {
                if (!confirm(`Delete policy "${p.name}"?`)) return;
                await api.deleteGuardrail(p.id);
                qc.invalidateQueries({ queryKey: ["guardrails"] });
                toast.success("Policy deleted");
              }}
            />
          ))}
        </div>
      )}

      {editing && (
        <EditPolicyModal
          policy={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["guardrails"] });
            setEditing(null);
          }}
        />
      )}
      {creating && (
        <CreatePolicyModal
          scope={scope}
          onClose={() => setCreating(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["guardrails"] });
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function scopeDescription(scope: GuardrailScope): string {
  switch (scope) {
    case "global":
      return "Master policy that applies to every request when no more specific policy fires.";
    case "provider":
      return "Per-provider overrides (OpenAI, Anthropic, Gemini, …).";
    case "model":
      return "Per-model overrides (gpt-5, claude-opus, gemini-2.5, …).";
    case "chain":
      return "Per-chain overrides (Customer Service, HR Assistant, …).";
    case "apikey":
      return "Per-API-key overrides — edit from the API Key detail page for the best experience.";
  }
}

function PolicyRow({
  policy,
  onEdit,
  onToggle,
  onDelete,
}: {
  policy: GuardrailPolicy;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const cfg = policy.config ?? {};
  const enabledDetectors = useMemo(() => {
    const out: string[] = [];
    if (cfg.pii?.enabled) out.push("PII");
    if (cfg.injection?.enabled) out.push("Injection");
    if (cfg.topics?.enabled) out.push("Topics");
    if (cfg.toxicity?.enabled) out.push("Toxicity");
    if (cfg.bias?.enabled) out.push("Bias");
    return out;
  }, [cfg]);

  return (
    <Card>
      <div className="px-5 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[var(--text-muted)]" />
            <span className="font-medium truncate">{policy.name}</span>
            <Badge tone={policy.enabled ? "success" : "neutral"}>
              {policy.enabled ? "Active" : "Disabled"}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)] truncate">
            scope: {policy.scope}
            {policy.scope_id && ` / ${policy.scope_id}`} ·{" "}
            {enabledDetectors.length === 0
              ? "no detectors enabled"
              : enabledDetectors.join(" · ")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Toggle checked={policy.enabled} onChange={onToggle} />
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="ghost" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function EditPolicyModal({
  policy,
  onClose,
  onSaved,
}: {
  policy: GuardrailPolicy;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(policy.name);
  const [config, setConfig] = useState<GuardrailPolicyConfig>(policy.config ?? {});

  const save = useMutation({
    mutationFn: () => api.updateGuardrail(policy.id, { name, config }),
    onSuccess: () => {
      toast.success("Policy saved");
      onSaved();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Save failed");
    },
  });

  return (
    <Modal open onClose={onClose} title={`Edit policy · ${policy.scope}`} maxWidth="max-w-3xl">
      <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
        <Field label="Policy name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <GuardrailEditor value={config} onChange={setConfig} />
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4 mr-1" />
          {save.isPending ? "Saving..." : "Save policy"}
        </Button>
      </div>
    </Modal>
  );
}

function CreatePolicyModal({
  scope,
  onClose,
  onCreated,
}: {
  scope: GuardrailScope;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(scope === "global" ? "Global Guardrails" : "");
  const [scopeID, setScopeID] = useState("");
  const [config, setConfig] = useState<GuardrailPolicyConfig>({});

  const create = useMutation({
    mutationFn: () =>
      api.createGuardrail({
        scope,
        scope_id: scope === "global" ? "" : scopeID,
        name,
        enabled: true,
        config,
      }),
    onSuccess: () => {
      toast.success("Policy created");
      onCreated();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Create failed");
    },
  });

  return (
    <Modal open onClose={onClose} title={`New ${scope} policy`} maxWidth="max-w-3xl">
      <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Policy name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={defaultNameFor(scope)}
            />
          </Field>
          {scope !== "global" && (
            <ScopeIDSelector scope={scope} value={scopeID} onChange={setScopeID} />
          )}
        </div>
        <GuardrailEditor value={config} onChange={setConfig} />
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => create.mutate()}
          disabled={create.isPending || (scope !== "global" && !scopeID.trim())}
        >
          <Save className="h-4 w-4 mr-1" />
          {create.isPending ? "Creating..." : "Create policy"}
        </Button>
      </div>
    </Modal>
  );
}

function defaultNameFor(scope: GuardrailScope): string {
  switch (scope) {
    case "global":
      return "Global Guardrails";
    case "provider":
      return "Provider policy";
    case "model":
      return "Model policy";
    case "chain":
      return "Chain policy";
    case "apikey":
      return "API key policy";
  }
}

function LogsTab() {
  const [detector, setDetector] = useState("");
  const [action, setAction] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const logs = useQuery({
    queryKey: ["guardrail-logs", detector, action],
    queryFn: () =>
      api.listGuardrailLogs({
        detector: detector || undefined,
        action: action || undefined,
        limit: 200,
      }),
    refetchInterval: 5000,
  });

  const rows = logs.data?.logs ?? [];
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card>
      <CardHeader
        title="Audit Logs"
        description="Recent guardrail decisions. Auto-refreshes every 5 seconds. Click a row to see what was detected."
        action={
          <div className="flex gap-2">
            <Select value={detector} onChange={(e) => setDetector(e.target.value)}>
              <option value="">All detectors</option>
              <option value="pii">PII</option>
              <option value="injection">Injection</option>
              <option value="topics">Topics</option>
              <option value="toxicity">Toxicity</option>
              <option value="bias">Bias</option>
            </Select>
            <Select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>
              <option value="block">Block</option>
              <option value="mask">Mask</option>
              <option value="warn">Warn</option>
              <option value="log_only">Log only</option>
            </Select>
          </div>
        }
      />
      <div className="px-5 pb-5">
        {logs.isLoading ? (
          <div className="py-8 flex justify-center">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No audit entries yet"
            hint="As guardrails fire, decisions land here. Try the Test Policy panel on a Global policy — your test will appear here within seconds."
          />
        ) : (
          <div className="text-xs">
            <table className="w-full text-left">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="py-2 pr-3 w-6"></th>
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Detector</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Severity</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Findings</th>
                  <th className="py-2 pr-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isOpen = expanded.has(row.id);
                  const findings = row.findings ?? [];
                  const isTest = row.api_key_id === "test-panel";
                  const entityCounts = countEntities(findings);
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className="border-t border-[var(--border)] cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                        onClick={() => toggle(row.id)}
                      >
                        <td className="py-2 pr-1 text-[var(--text-muted)]">{isOpen ? "▾" : "▸"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 font-mono">{row.detector}</td>
                        <td className="py-2 pr-3">
                          <Badge
                            tone={
                              row.action === "block"
                                ? "danger"
                                : row.action === "mask"
                                ? "warning"
                                : "neutral"
                            }
                          >
                            {row.action}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">{row.severity || "—"}</td>
                        <td className="py-2 pr-3">
                          {isTest ? (
                            <Badge tone="accent">test panel</Badge>
                          ) : row.provider || row.model ? (
                            <span className="font-mono text-[10px]">
                              {row.provider || "?"}
                              {row.model ? `/${row.model}` : ""}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {entityCounts.length === 0 ? (
                            <span className="text-[var(--text-muted)]">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {entityCounts.map(([e, n]) => (
                                <Badge key={e} tone="neutral">
                                  {e}
                                  {n > 1 ? ` ×${n}` : ""}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-3 max-w-md truncate" title={row.reason}>
                          {row.reason}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-[var(--border)] bg-black/[0.03] dark:bg-white/[0.03]">
                          <td></td>
                          <td colSpan={7} className="py-3 pr-3">
                            <FindingsDetails row={row} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function countEntities(findings: { entity: string }[]): [string, number][] {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.entity] = (counts[f.entity] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function FindingsDetails({
  row,
}: {
  row: {
    id: string;
    request_id: string;
    direction: string;
    findings: { entity: string; score: number; start: number; end: number; original?: string; redacted?: string }[] | null;
  };
}) {
  const findings = row.findings ?? [];
  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex gap-4 text-[var(--text-muted)]">
        <span>
          <span className="font-semibold">Request:</span>{" "}
          <code className="font-mono">{row.request_id || "—"}</code>
        </span>
        <span>
          <span className="font-semibold">Direction:</span> {row.direction}
        </span>
      </div>
      {findings.length === 0 ? (
        <div className="italic text-[var(--text-muted)]">No findings recorded.</div>
      ) : (
        <table className="w-full text-left">
          <thead className="text-[var(--text-muted)]">
            <tr>
              <th className="py-1 pr-3">Entity</th>
              <th className="py-1 pr-3">Score</th>
              <th className="py-1 pr-3">Original (truncated)</th>
              <th className="py-1 pr-3">Replacement</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f, i) => (
              <tr key={i} className="border-t border-[var(--border)]">
                <td className="py-1 pr-3 font-mono">{f.entity}</td>
                <td className="py-1 pr-3">{(f.score * 100).toFixed(0)}%</td>
                <td className="py-1 pr-3 font-mono">
                  {f.original ? (
                    <code className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">
                      {f.original}
                    </code>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-1 pr-3 font-mono">
                  {f.redacted ? (
                    <code className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                      {f.redacted}
                    </code>
                  ) : (
                    <span className="text-[var(--text-muted)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
