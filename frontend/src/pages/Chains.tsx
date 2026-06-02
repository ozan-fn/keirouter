import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Layers, Plus, Trash2, X, ArrowRight, Pencil, Check, Copy, ChevronDown,
  ArrowUp, ArrowDown, GripVertical, Loader2,
} from "lucide-react";
import { api, type Chain, type Provider } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { useToast } from "../components/Toast";
import { Card, Button, Input, Select, Field, Badge, Spinner, EmptyState } from "../components/ui";

interface DraftStep {
  provider: string;
  model: string;
}

export function ChainsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const chains = useQuery({ queryKey: ["chains"], queryFn: () => api.listChains() });
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api.providers() });

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteChain(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chains"] });
      setDeletingId(null);
      toast.success("Combo deleted", "The routing chain has been removed. Target it by name will no longer resolve.");
    },
    onError: (e: Error) => toast.error("Deletion failed", e.message),
  });

  const updateStrategy = useMutation({
    mutationFn: ({ id, strategy }: { id: string; strategy: string }) =>
      api.updateChain(id, { strategy }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chains"] }),
  });

  const list = chains.data?.chains ?? [];
  const providerList = providers.data?.providers ?? [];

  return (
    <>
      <PageHeader
        title="Combos"
        icon={Layers}
        description="Named model chains. Target with chain:name or the bare combo name as your model."
        action={
          <Button onClick={() => { setShowCreate(true); setEditingId(null); }}>
            <Plus className="h-4 w-4" />
            Create Combo
          </Button>
        }
      />

      <div className="space-y-4">
        {/* Create form */}
        {showCreate && (
          <ComboForm
            providers={providerList}
            onClose={() => setShowCreate(false)}
          />
        )}

        {/* Edit form */}
        {editingId && (
          <ComboForm
            chain={list.find((c) => c.id === editingId)}
            providers={providerList}
            onClose={() => setEditingId(null)}
          />
        )}

        {/* Delete confirmation */}
        {deletingId && (
          <Card className="border-red-500/30 bg-red-500/5 dark:border-red-500/20 dark:bg-red-500/10">
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm">
                Delete combo <span className="font-mono font-medium">{list.find((c) => c.id === deletingId)?.name}</span>?
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setDeletingId(null)} className="h-8 text-xs">Cancel</Button>
                <Button variant="danger" onClick={() => remove.mutate(deletingId)} className="h-8 text-xs"
                  disabled={remove.isPending}>
                  {remove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Combo list */}
        {chains.isLoading ? (
          <Spinner />
        ) : list.length === 0 ? (
          <Card>
            <EmptyState
              title="No combos yet"
              hint="Create a combo to group models into a named fallback chain."
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {list.map((c) => (
              <ComboCard
                key={c.id}
                chain={c}
                onEdit={() => { setEditingId(c.id); setShowCreate(false); }}
                onDelete={() => setDeletingId(c.id)}
                onToggleRR={() => updateStrategy.mutate({
                  id: c.id,
                  strategy: c.strategy === "round_robin" ? "priority" : "round_robin",
                })}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Combo Card ──────────────────────────────────────────────────────────────

function ComboCard({ chain: c, onEdit, onDelete, onToggleRR }: {
  chain: Chain;
  onEdit: () => void;
  onDelete: () => void;
  onToggleRR: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const models = c.steps.map((s) => `${s.provider}/${s.model}`);
  const displayModels = showAll ? models : models.slice(0, 3);
  const remaining = models.length - 3;

  const copyName = () => {
    navigator.clipboard.writeText(`chain:${c.name}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 transition-colors hover:border-[var(--border)] hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        {/* Left: name + models */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="h-4 w-4 shrink-0 text-accent-500" />
            <span className="font-mono text-sm font-semibold">chain:{c.name}</span>
            <Badge tone="accent">{c.strategy === "round_robin" ? "round-robin" : c.strategy}</Badge>
            <span className="text-xs text-[var(--text-muted)]">{models.length} model{models.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Model chips */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {displayModels.map((m, i) => (
              <span key={i} className="flex items-center">
                {i > 0 && <ArrowRight className="mx-0.5 h-3 w-3 text-[var(--text-muted)]" />}
                <span className="rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                  {m}
                </span>
              </span>
            ))}
            {!showAll && remaining > 0 && (
              <button onClick={() => setShowAll(true)}
                className="rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]">
                +{remaining} more
              </button>
            )}
            {showAll && models.length > 3 && (
              <button onClick={() => setShowAll(false)}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]">
                show less
              </button>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 items-center gap-0.5">
          {/* Round-robin toggle */}
          <button onClick={onToggleRR}
            className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-[10px] font-medium transition-colors ${
              c.strategy === "round_robin"
                ? "border-accent-500/40 bg-accent-500/10 text-accent-600 dark:text-accent-400"
                : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
            }`}
            title="Toggle round-robin">
            RR
          </button>
          {/* Copy name */}
          <button onClick={copyName}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
            title="Copy combo name">
            {copied ? <Check className="h-4 w-4 text-emerald-500 dark:text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
          {/* Edit */}
          <button onClick={onEdit}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
            title="Edit">
            <Pencil className="h-4 w-4" />
          </button>
          {/* Delete */}
          <button onClick={onDelete}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500"
            title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Combo Form (Create / Edit) ──────────────────────────────────────────────

function ComboForm({ chain, providers, onClose }: {
  chain?: Chain;
  providers: Provider[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const isEdit = !!chain;

  const [name, setName] = useState(chain?.name ?? "");
  const [strategy, setStrategy] = useState(chain?.strategy ?? "priority");
  const [steps, setSteps] = useState<DraftStep[]>(
    chain?.steps.map((s) => ({ provider: s.provider, model: s.model })) ?? [{ provider: "", model: "" }]
  );
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => api.createChain({
      name: name.trim(),
      strategy,
      steps: steps.filter((s) => s.provider && s.model),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chains"] });
      toast.success("Combo created", `Routing chain "${name.trim()}" is now available as a model target.`);
      onClose();
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error("Combo creation failed", e.message);
    },
  });

  const update = useMutation({
    mutationFn: () => api.updateChain(chain!.id, {
      name: name.trim(),
      strategy,
      steps: steps.filter((s) => s.provider && s.model),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chains"] });
      toast.success("Combo updated", `Routing chain "${name.trim()}" has been saved with the new configuration.`);
      onClose();
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error("Combo update failed", e.message);
    },
  });

  const addStep = () => setSteps((s) => [...s, { provider: "", model: "" }]);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));
  const updateStep = (i: number, patch: Partial<DraftStep>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const moveStep = (i: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const valid = name.trim() && steps.some((s) => s.provider && s.model);

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <h3 className="text-sm font-semibold">{isEdit ? "Edit Combo" : "Create Combo"}</h3>
        <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-4 px-4 py-4">
        {/* Name + Strategy */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Combo name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-combo"
              className="font-mono" />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Use as <span className="font-mono">chain:{name || "name"}</span> or bare <span className="font-mono">{name || "name"}</span> as model
            </p>
          </Field>
          <Field label="Strategy">
            <Select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
              <option value="priority">Priority (ordered fallback)</option>
              <option value="round_robin">Round Robin (rotate)</option>
              <option value="latency">Latency (fastest first)</option>
              <option value="cost">Cost (cheapest first)</option>
            </Select>
          </Field>
        </div>

        {/* Steps */}
        <div>
          <span className="text-xs font-medium text-[var(--text-muted)]">Model chain</span>
          <div className="mt-2 space-y-2">
            {steps.map((step, i) => (
              <div key={i}>
                {i > 0 && (
                  <div className="flex items-center py-0.5 pl-3">
                    <ArrowRight className="h-3 w-3 text-[var(--text-muted)]" />
                    <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                      {i === steps.length - 1 ? "last resort" : `fallback ${i}`}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-600 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="w-44">
                    <Select value={step.provider} onChange={(e) => updateStep(i, { provider: e.target.value })}>
                      <option value="">Provider…</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.display_name}</option>
                      ))}
                    </Select>
                  </div>
                  <Input
                    className="flex-1 font-mono"
                    value={step.model}
                    onChange={(e) => updateStep(i, { model: e.target.value })}
                    placeholder="model-id"
                  />
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => moveStep(i, -1)} disabled={i === 0}
                      className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] disabled:opacity-20">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}
                      className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] disabled:opacity-20">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    {steps.length > 1 && (
                      <button onClick={() => removeStep(i)}
                        className="rounded p-1 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={addStep}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-accent-500 hover:text-accent-600">
            <Plus className="h-3.5 w-3.5" /> Add model
          </button>
        </div>

        {error && <p className="text-xs text-[color:var(--color-danger)]">{error}</p>}

        <div className="flex items-center gap-2">
          <Button onClick={() => (isEdit ? update.mutate() : create.mutate())}
            disabled={!valid || create.isPending || update.isPending}>
            {(create.isPending || update.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isEdit ? "Save changes" : "Create combo"}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Card>
  );
}
