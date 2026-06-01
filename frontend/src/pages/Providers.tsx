import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes } from "lucide-react";
import { api, type Provider } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { Card, CardHeader, Badge, Spinner, EmptyState } from "../components/ui";

// kindFilters are the service-kind tabs shown above the provider grid.
const kindFilters = [
  { id: "all", label: "All" },
  { id: "llm", label: "Chat" },
  { id: "embedding", label: "Embeddings" },
  { id: "image", label: "Image" },
  { id: "stt", label: "Speech-to-Text" },
  { id: "tts", label: "Text-to-Speech" },
  { id: "search", label: "Web Search" },
  { id: "fetch", label: "Web Fetch" },
];

const kindLabels: Record<string, string> = {
  llm: "Chat",
  embedding: "Embed",
  image: "Image",
  stt: "STT",
  tts: "TTS",
  search: "Search",
  fetch: "Fetch",
};

export function ProvidersPage() {
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api.providers() });
  const [filter, setFilter] = useState("all");

  const list = useMemo(() => {
    const all = providers.data?.providers ?? [];
    const visible = all.filter((p) => !p.hidden);
    if (filter === "all") return visible;
    return visible.filter((p) => p.service_kinds.includes(filter));
  }, [providers.data, filter]);

  return (
    <>
      <PageHeader
        title="Providers"
        icon={Boxes}
        description="Built-in providers you can connect accounts to. Filter by what each one can do."
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {kindFilters.map((k) => (
          <button
            key={k.id}
            onClick={() => setFilter(k.id)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              filter === k.id
                ? "bg-accent-600 text-white shadow-sm"
                : "border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-ink-100 dark:hover:bg-ink-800"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title={`${list.length} providers`} />
        {providers.isLoading ? (
          <Spinner />
        ) : !list.length ? (
          <EmptyState title="No providers for this capability" />
        ) : (
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-b-2xl bg-[var(--border)] sm:grid-cols-2">
            {list.map((p) => (
              <ProviderRow key={p.id} provider={p} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function ProviderRow({ provider: p }: { provider: Provider }) {
  return (
    <div className="flex items-start gap-3 bg-[var(--bg-elevated)] px-5 py-4 transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/40">
      <ProviderIcon provider={p} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{p.display_name}</span>
          {p.deprecated && <Badge tone="danger">risk</Badge>}
          {!p.drivable && <Badge tone="neutral">soon</Badge>}
        </div>
        <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">{p.id}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {p.service_kinds.map((k) => (
            <Badge key={k} tone="accent">
              {kindLabels[k] ?? k}
            </Badge>
          ))}
        </div>
        {p.input_per_m || p.output_per_m ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            ${p.input_per_m}/${p.output_per_m} per 1M tokens
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ProviderIcon renders the provider PNG with a colored fallback initial.
function ProviderIcon({ provider: p }: { provider: Provider }) {
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