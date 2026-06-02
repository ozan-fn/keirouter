import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Plus, Trash2, X, ArrowRight, Pencil, Check } from "lucide-react";
import { api, type Chain } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { useToast } from "../components/Toast";
import { Card, SectionHeader, CardHeader, Button, Input, Select, Field, Badge, Spinner, EmptyState } from "../components/ui";

interface DraftStep {
  provider: string;
  model: string;
}

export function ChainsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const chains = useQuery({ queryKey: ["chains"], queryFn: () => api.listChains() });
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api.providers() });
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([{ provider: "", model: "" }]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSteps, setEditSteps] = useState<DraftStep[]>([]);

  const create = useMutation({
    mutationFn: () =>
      api.createChain({ name, steps: steps.filter((s) => s.provider && s.model) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chains"] });
      setName("");
      setSteps([{ provider: "", model: "" }]);
      setError("");
      toast.success("Chain created");
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error("Couldn't create chain", e.message);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; steps?: DraftStep[] } }) =>
      api.updateChain(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chains"] });
      setEditingId(null);
      toast.success("Chain updated");
    },
    onError: (e: Error) => toast.error("Couldn't update chain", e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteChain(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chains"] });
      toast.success("Chain deleted");
    },
    onError: (e: Error) => toast.error("Couldn't delete chain", e.message),
  });

  const startEdit = (chain: Chain) => {
    setEditingId(chain.id);
    setEditName(chain.name);
    setEditSteps(chain.steps.map((s) => ({ provider: s.provider, model: s.model })));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditSteps([]);
  };

  const saveEdit = () => {
    if (!editingId) return;
    update.mutate({ id: editingId, data: { name: editName, steps: editSteps.filter((s) => s.provider && s.model) } });
  };

  const updateStep = (i: number, patch: Partial<DraftStep>, isEdit = false) => {
    if (isEdit) {
      setEditSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    } else {
      setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    }
  };

  const addStep = (isEdit = false) => {
    if (isEdit) {
      setEditSteps((s) => [...s, { provider: "", model: "" }]);
    } else {
      setSteps((s) => [...s, { provider: "", model: "" }]);
    }
  };

  const removeStep = (i: number, isEdit = false) => {
    if (isEdit) {
      setEditSteps((s) => s.filter((_, idx) => idx !== i));
    } else {
      setSteps((s) => s.filter((_, idx) => idx !== i));
    }
  };

  const valid = name.trim() && steps.some((s) => s.provider && s.model);

  return (
    <>
      <PageHeader
        title="Routing Chains"
        icon={GitBranch}
        description="Ordered fallback. Each request tries steps top to bottom, skipping models that can't honor it."
      />

      <Card className="mb-6">
        <SectionHeader title="Create chain" description="Define an ordered list of provider/model fallbacks." icon={Plus} />
        <form
          className="space-y-4 px-6 pb-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) create.mutate();
          }}
        >
          <Field label="Chain name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="coding" />
          </Field>

          <StepEditor
            steps={steps}
            providers={providers.data?.providers ?? []}
            onUpdate={(i, patch) => updateStep(i, patch)}
            onAdd={() => addStep()}
            onRemove={(i) => removeStep(i)}
          />

          <div className="flex items-center justify-between">
            {error ? <span className="text-xs text-[color:var(--color-danger)]">{error}</span> : <span />}
            <Button type="submit" disabled={create.isPending || !valid}>
              {create.isPending ? "Creating…" : "Create chain"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Chains" />
        {chains.isLoading ? (
          <Spinner />
        ) : !chains.data?.chains.length ? (
          <EmptyState title="No chains yet" hint="Create one above, then target it as chain:name." />
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {chains.data.chains.map((c) => (
              <div key={c.id} className="px-6 py-4">
                {editingId === c.id ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-48" />
                      <Badge tone="accent">{c.strategy}</Badge>
                    </div>
                    <StepEditor
                      steps={editSteps}
                      providers={providers.data?.providers ?? []}
                      onUpdate={(i, patch) => updateStep(i, patch, true)}
                      onAdd={() => addStep(true)}
                      onRemove={(i) => removeStep(i, true)}
                    />
                    <div className="flex items-center gap-2">
                      <Button onClick={saveEdit} disabled={update.isPending}>
                        <Check className="h-4 w-4" />
                        Save
                      </Button>
                      <Button variant="ghost" onClick={cancelEdit}>
                        <X className="h-4 w-4" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">chain:{c.name}</span>
                        <Badge tone="accent">{c.strategy}</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" onClick={() => startEdit(c)} className="px-2">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="danger" onClick={() => remove.mutate(c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {c.steps.map((s, i) => (
                        <span key={i} className="flex items-center gap-1.5 font-mono text-xs text-[var(--text-muted)]">
                          {i > 0 && <ArrowRight className="h-3 w-3" />}
                          <span className="rounded-md bg-[var(--bg-subtle)] px-2 py-0.5">
                            {s.provider}/{s.model}
                          </span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function StepEditor({
  steps,
  providers,
  onUpdate,
  onAdd,
  onRemove,
}: {
  steps: DraftStep[];
  providers: { id: string; display_name: string }[];
  onUpdate: (i: number, patch: Partial<DraftStep>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-[var(--text-muted)]">Fallback steps</span>
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-xs font-medium text-[var(--text-muted)]">
            {i + 1}
          </span>
          <div className="w-48">
            <Select value={step.provider} onChange={(e) => onUpdate(i, { provider: e.target.value })}>
              <option value="">Provider…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </Select>
          </div>
          <Input
            className="flex-1"
            value={step.model}
            onChange={(e) => onUpdate(i, { model: e.target.value })}
            placeholder="model id, e.g. gpt-4o"
          />
          {steps.length > 1 && (
            <Button variant="ghost" type="button" className="px-2" onClick={() => onRemove(i)}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      <Button variant="ghost" type="button" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Add step
      </Button>
    </div>
  );
}
