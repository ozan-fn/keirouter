import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Copy, Check, ToggleLeft, ToggleRight, ArrowLeft, ArrowRight, X, Search, ChevronDown } from "lucide-react";
import { api, type CreatedKey } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { useToast } from "../components/Toast";
import {
  Card,
  CardHeader,
  Button,
  Input,
  Select,
  Field,
  Badge,
  Spinner,
  EmptyState,
  Toggle,
  Modal,
} from "../components/ui";

const budgetPeriods = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "total", label: "All time" },
];

// Format number with thousand separators: 1000000 → "1.000.000"
function formatTokenLimit(value: string): string {
  if (!value) return "";
  const n = parseInt(value.replace(/\D/g, ""), 10);
  if (isNaN(n)) return "";
  return n.toLocaleString("id-ID");
}

/* ── Formatted Token Input ─────────────────────────────────────────── */

function FormattedTokenInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const formatted = formatTokenLimit(value);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={focused ? value : formatted}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, "");
        onChange(raw);
      }}
      placeholder={placeholder ? formatTokenLimit(placeholder) : undefined}
      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm placeholder:text-[var(--text-muted)] focus:border-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/40"
    />
  );
}

/* ── Model Multi-Select with Provider Logos ────────────────────────── */

interface ModelOption {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  icon: string;
}

function ModelMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customText, setCustomText] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api.providers() });
  const visibleProviders = useMemo(
    () => (providers.data?.providers ?? []).filter((p) => !p.hidden),
    [providers.data],
  );

  const modelQueries = useQueries({
    queries: visibleProviders.map((p) => ({
      queryKey: ["providerModels", p.id],
      queryFn: () => api.providerModels(p.id),
      staleTime: 300_000,
    })),
  });

  const allModels = useMemo<ModelOption[]>(() => {
    const result: ModelOption[] = [];
    visibleProviders.forEach((p, i) => {
      const models = modelQueries[i]?.data?.models ?? [];
      models.forEach((m) => {
        result.push({
          id: m.id,
          name: m.name || m.id,
          providerId: p.id,
          providerName: p.display_name,
          icon: `/providers/${p.id}.png`,
        });
      });
    });
    return result;
  }, [visibleProviders, modelQueries]);

  // Lookup for chip display (maps model ID → provider info)
  const modelLookup = useMemo(() => {
    const map = new Map<string, ModelOption>();
    allModels.forEach((m) => map.set(m.id, m));
    return map;
  }, [allModels]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allModels;
    const q = query.toLowerCase();
    return allModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.providerId.toLowerCase().includes(q) ||
        m.providerName.toLowerCase().includes(q),
    );
  }, [allModels, query]);

  // Group by provider
  const grouped = useMemo(() => {
    const map = new Map<string, { provider: string; providerName: string; icon: string; models: ModelOption[] }>();
    filtered.forEach((m) => {
      if (!map.has(m.providerId)) {
        map.set(m.providerId, { provider: m.providerId, providerName: m.providerName, icon: m.icon, models: [] });
      }
      map.get(m.providerId)!.models.push(m);
    });
    return Array.from(map.values());
  }, [filtered]);

  const updateRect = useCallback(() => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
  }, []);

  useEffect(() => {
    if (!open) return;
    updateRect();
    const onScroll = () => updateRect();
    const onResize = () => updateRect();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updateRect]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as globalThis.Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const removeChip = (id: string) => {
    onChange(value.filter((v) => v !== id));
  };

  const addCustom = () => {
    const t = customText.trim();
    if (t && !value.includes(t)) {
      onChange([...value, t]);
      setCustomText("");
    }
  };

  const anyLoading = modelQueries.some((q) => q.isLoading);

  const dropdown = open && rect
    ? createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[100] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-float)]"
          style={{ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 360), maxHeight: 420 }}
        >
          {/* Search */}
          <div className="border-b border-[var(--border)] p-2">
            <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-subtle)] px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>

          {/* Model list grouped by provider */}
          <div className="max-h-60 overflow-y-auto p-1">
            {anyLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-accent-500" />
              </div>
            ) : grouped.length === 0 ? (
              <p className="px-3 py-2.5 text-center text-xs text-[var(--text-muted)]">No models found</p>
            ) : (
              grouped.map((g) => (
                <div key={g.provider}>
                  <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                    <img
                      src={g.icon}
                      alt=""
                      className="h-4 w-4 shrink-0 rounded-sm object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {g.providerName}
                    </span>
                  </div>
                  {g.models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(m.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--bg-subtle)] ${
                        value.includes(m.id) ? "bg-accent-500/10" : ""
                      }`}
                    >
                      <div
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          value.includes(m.id)
                            ? "border-accent-500 bg-accent-500"
                            : "border-[var(--border)]"
                        }`}
                      >
                        {value.includes(m.id) && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <span className="flex-1 truncate">{m.name}</span>
                      {m.id !== m.name && (
                        <span className="truncate text-[11px] text-[var(--text-muted)]">{m.id}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Custom pattern input */}
          <div className="border-t border-[var(--border)] p-2">
            <div className="flex items-center gap-2">
              <input
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                placeholder="Add custom pattern (e.g. claude-*)"
                className="flex-1 rounded-lg bg-[var(--bg-subtle)] px-2.5 py-1.5 text-sm outline-none placeholder:text-[var(--text-muted)]"
              />
              <button
                type="button"
                onClick={addCustom}
                disabled={!customText.trim()}
                className="rounded-lg bg-accent-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div>
      {/* Selected chips */}
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((id) => {
            const m = modelLookup.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500/10 px-2 py-1 text-xs font-medium text-accent-700 dark:text-accent-300"
              >
                {m && (
                  <img
                    src={m.icon}
                    alt=""
                    className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <span className="max-w-[180px] truncate">{id}</span>
                <button
                  type="button"
                  onClick={() => removeChip(id)}
                  className="ml-0.5 rounded p-0.5 transition-colors hover:bg-accent-500/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Trigger button */}
      <div ref={triggerRef}>
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
            setQuery("");
          }}
          className="flex w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-left text-sm transition-colors focus:border-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/40"
        >
          <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          <span className={`flex-1 ${value.length > 0 ? "" : "text-[var(--text-muted)]"}`}>
            {value.length > 0
              ? `${value.length} model${value.length !== 1 ? "s" : ""} selected`
              : "Search and select models…"}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {dropdown}
    </div>
  );
}

/* ── Keys Page ─────────────────────────────────────────────────────── */

export function KeysPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const keys = useQuery({ queryKey: ["keys"], queryFn: () => api.listKeys() });

  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 — name
  const [name, setName] = useState("");

  // Step 2 — budget
  const [budgetLimit, setBudgetLimit] = useState("");
  const [budgetLimitTokens, setBudgetLimitTokens] = useState("");
  const [budgetPeriod, setBudgetPeriod] = useState("monthly");
  const [budgetAlertPct, setBudgetAlertPct] = useState(80);
  const [budgetHardCutoff, setBudgetHardCutoff] = useState(true);
  const [allowedModels, setAllowedModels] = useState<string[]>([]);

  // Step 3 — result
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  const openModal = () => {
    setName("");
    setBudgetLimit("");
    setBudgetLimitTokens("");
    setBudgetPeriod("monthly");
    setBudgetAlertPct(80);
    setBudgetHardCutoff(true);
    setAllowedModels([]);
    setCreated(null);
    setCopied(false);
    setStep(1);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    if (created) {
      setCreated(null);
      setCopied(false);
    }
  };

  const create = useMutation({
    mutationFn: () => {
      const hasLimit = parseFloat(budgetLimit) > 0;
      const hasTokenLimit = parseInt(budgetLimitTokens) > 0;
      const opts =
        hasLimit || hasTokenLimit || allowedModels.length > 0
          ? {
              ...(hasLimit ? { budget_limit_usd: parseFloat(budgetLimit) } : {}),
              ...(hasTokenLimit ? { budget_limit_tokens: parseInt(budgetLimitTokens) } : {}),
              ...(hasLimit || hasTokenLimit
                ? { budget_period: budgetPeriod, budget_alert_pct: budgetAlertPct, budget_hard_cutoff: budgetHardCutoff }
                : {}),
              ...(allowedModels.length > 0 ? { allowed_models: allowedModels } : {}),
            }
          : undefined;
      return api.createKey(name, opts);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["keys"] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({ queryKey: ["budget-status"] });
      setCreated(data);
      setStep(3);
      const parts = [];
      if (data.budget && data.budget.limit_micros > 0) parts.push(`$${(data.budget.limit_micros / 1_000_000).toFixed(2)}`);
      if (data.budget && data.budget.limit_tokens > 0) parts.push(`${(data.budget.limit_tokens / 1_000_000).toFixed(0)}M tokens`);
      const budgetMsg = parts.length > 0 ? ` Budget attached: ${parts.join(" + ")} / ${data.budget?.period}.` : "";
      const modelMsg = data.allowed_models?.length ? ` Models: ${data.allowed_models.join(", ")}.` : "";
      toast.success("Key created", `Copy the key below — it won't be shown again.${budgetMsg}${modelMsg}`);
    },
    onError: (e: Error) => toast.error("Key creation failed", e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteKey(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["keys"] });
      toast.success("Key revoked", "The key has been permanently deleted and can no longer authenticate requests.");
    },
    onError: (e: Error) => toast.error("Revocation failed", e.message),
  });

  const toggleDisabled = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) => api.updateKey(id, { disabled }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["keys"] });
      toast.success(
        data.disabled ? "Key disabled" : "Key enabled",
        data.disabled
          ? "Requests using this key will be rejected until re-enabled."
          : "This key can now authenticate requests again.",
      );
    },
    onError: (e: Error) => toast.error("Key update failed", e.message),
  });

  return (
    <>
      <PageHeader
        title="API Keys"
        icon={KeyRound}
        description="Keys your tools use to authenticate. Stored hashed; shown once."
        action={
          <Button onClick={openModal}>
            <Plus className="h-4 w-4" />
            New key
          </Button>
        }
      />

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={step === 3 ? "Key created" : "Create API key"}
        subtitle={
          step === 1
            ? "Name your key so you can identify it later."
            : step === 2
              ? "Optionally set budget limits and model restrictions."
              : undefined
        }
      >
        {step === 1 && <StepName name={name} setName={setName} onNext={() => setStep(2)} />}
        {step === 2 && (
          <StepBudget
            budgetLimit={budgetLimit}
            setBudgetLimit={setBudgetLimit}
            budgetLimitTokens={budgetLimitTokens}
            setBudgetLimitTokens={setBudgetLimitTokens}
            budgetPeriod={budgetPeriod}
            setBudgetPeriod={setBudgetPeriod}
            budgetAlertPct={budgetAlertPct}
            setBudgetAlertPct={setBudgetAlertPct}
            budgetHardCutoff={budgetHardCutoff}
            setBudgetHardCutoff={setBudgetHardCutoff}
            allowedModels={allowedModels}
            setAllowedModels={setAllowedModels}
            onBack={() => setStep(1)}
            onCreate={() => create.mutate()}
            isPending={create.isPending}
            isFirstKey={(keys.data?.keys?.length ?? 0) === 0}
          />
        )}
        {step === 3 && created && (
          <StepSuccess
            created={created}
            copied={copied}
            setCopied={setCopied}
            onClose={closeModal}
          />
        )}
      </Modal>

      <Card>
        <CardHeader title="Keys" />
        {keys.isLoading ? (
          <Spinner />
        ) : !keys.data?.keys?.length ? (
          <EmptyState title="No keys yet" />
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {keys.data.keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{k.name}</span>
                    {k.disabled ? <Badge tone="danger">disabled</Badge> : <Badge tone="success">active</Badge>}
                    {k.allowed_models && k.allowed_models.length > 0 && (
                      <Badge tone="accent">{k.allowed_models.length} model{k.allowed_models.length > 1 ? "s" : ""}</Badge>
                    )}
                  </div>
                  {k.allowed_models && k.allowed_models.length > 0 && (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      Models: {k.allowed_models.join(", ")}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(k.display);
                      toast.success("Key copied", "The masked key identifier has been copied to your clipboard.");
                    }}
                    className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                    title="Copy key"
                  >
                    {k.display}
                    <Copy className="h-3 w-3 opacity-50 transition-opacity hover:opacity-100" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => toggleDisabled.mutate({ id: k.id, disabled: !k.disabled })}
                    disabled={toggleDisabled.isPending}
                    className="px-2"
                    title={k.disabled ? "Enable key" : "Disable key"}
                  >
                    {k.disabled ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />}
                  </Button>
                  <Button variant="danger" onClick={() => remove.mutate(k.id)}>
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/* ── Step 1: Name ───────────────────────────────────────────────── */

function StepName({
  name,
  setName,
  onNext,
}: {
  name: string;
  setName: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4 px-6 py-5">
      <Field label="Key name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="laptop"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              e.preventDefault();
              onNext();
            }
          }}
        />
      </Field>
      <div className="flex gap-2 pt-1">
        <Button className="flex-1" onClick={onNext} disabled={!name.trim()}>
          Next
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ── Step 2: Budget (optional) ──────────────────────────────────── */

function StepBudget({
  budgetLimit,
  setBudgetLimit,
  budgetLimitTokens,
  setBudgetLimitTokens,
  budgetPeriod,
  setBudgetPeriod,
  budgetAlertPct,
  setBudgetAlertPct,
  budgetHardCutoff,
  setBudgetHardCutoff,
  allowedModels,
  setAllowedModels,
  onBack,
  onCreate,
  isPending,
  isFirstKey,
}: {
  budgetLimit: string;
  setBudgetLimit: (v: string) => void;
  budgetLimitTokens: string;
  setBudgetLimitTokens: (v: string) => void;
  budgetPeriod: string;
  setBudgetPeriod: (v: string) => void;
  budgetAlertPct: number;
  setBudgetAlertPct: (v: number) => void;
  budgetHardCutoff: boolean;
  setBudgetHardCutoff: (v: boolean) => void;
  allowedModels: string[];
  setAllowedModels: (v: string[]) => void;
  onBack: () => void;
  onCreate: () => void;
  isPending: boolean;
  isFirstKey: boolean;
}) {
  return (
    <div className="space-y-4 px-6 py-5">
      {isFirstKey && (
        <div className="rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 dark:border-accent-800 dark:bg-accent-950/30">
          <p className="text-sm font-medium text-accent-800 dark:text-accent-200">
            Set a budget to control spending
          </p>
          <p className="mt-0.5 text-xs text-accent-700 dark:text-accent-300">
            This is your first key. Adding a budget now prevents surprise bills.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Limit (USD)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={budgetLimit}
              onChange={(e) => setBudgetLimit(e.target.value)}
              placeholder="50.00"
            />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Limit (Tokens)">
            <FormattedTokenInput
              value={budgetLimitTokens}
              onChange={setBudgetLimitTokens}
              placeholder="100000000"
            />
          </Field>
        </div>
        <div className="w-36">
          <Field label="Period">
            <Select value={budgetPeriod} onChange={(e) => setBudgetPeriod(e.target.value)}>
              {budgetPeriods.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <Field label="Allowed models">
        <ModelMultiSelect value={allowedModels} onChange={setAllowedModels} />
        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
          Select models or add custom patterns with * wildcard (e.g. claude-*)
        </p>
      </Field>

      <div className="flex items-end gap-6">
        <div className="w-40">
          <Field label="Alert threshold (%)">
            <Input
              type="number"
              min="1"
              max="100"
              value={budgetAlertPct}
              onChange={(e) => setBudgetAlertPct(parseInt(e.target.value) || 80)}
            />
          </Field>
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <Toggle checked={budgetHardCutoff} onChange={setBudgetHardCutoff} />
          <span className="text-sm">Hard cutoff (block when exhausted)</span>
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" onClick={onCreate} disabled={isPending}>
          {isPending ? "Creating…" : "Skip budget"}
        </Button>
        <Button onClick={onCreate} disabled={isPending}>
          {isPending ? "Creating…" : "Create key"}
        </Button>
      </div>
    </div>
  );
}

/* ── Step 3: Success / Copy ─────────────────────────────────────── */

function StepSuccess({
  created,
  copied,
  setCopied,
  onClose,
}: {
  created: CreatedKey;
  copied: boolean;
  setCopied: (v: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 px-6 py-5">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
        <p className="text-xs font-medium text-[var(--text-muted)]">Your new key — copy it now, it won't be shown again.</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded-lg bg-[var(--bg-elevated)] px-3 py-2.5 font-mono text-sm">
            {created.key}
          </code>
          <Button
            onClick={() => {
              navigator.clipboard.writeText(created.key);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      {created.budget && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--text-muted)]">Budget attached</p>
          <p className="mt-0.5 text-sm">
            {created.budget.limit_micros > 0 && `$${(created.budget.limit_micros / 1_000_000).toFixed(2)}`}
            {created.budget.limit_micros > 0 && created.budget.limit_tokens > 0 && " + "}
            {created.budget.limit_tokens > 0 &&
              `${formatTokenLimit(String(created.budget.limit_tokens))} tokens`}
            {` / ${created.budget.period}`}
            {created.budget.hard_cutoff ? " (hard cutoff)" : ""}
          </p>
        </div>
      )}

      {created.allowed_models && created.allowed_models.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--text-muted)]">Allowed models</p>
          <p className="mt-0.5 text-sm">{created.allowed_models.join(", ")}</p>
        </div>
      )}

      <Button className="w-full" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}