import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TerminalSquare,
  Copy,
  Check,
  Settings,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { api, type CLITool } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { Card, SectionHeader, Input, Field, Spinner } from "../components/ui";

export function CLIToolsPage() {
  const [model, setModel] = useState("");
  const tools = useQuery({
    queryKey: ["cli-tools", model],
    queryFn: () => api.cliTools(model || undefined),
  });

  return (
    <>
      <PageHeader
        title="CLI Tools"
        icon={TerminalSquare}
        description="Copy-paste configuration for coding tools, wired to this KeiRouter instance."
      />

      <Card className="mb-6 p-5">
        <Field label="Model to embed in snippets">
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="openai/gpt-4o or chain:my-chain"
            className="max-w-md"
          />
        </Field>
        {tools.data && (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Base URL: <span className="font-mono">{tools.data.base_url}</span>
          </p>
        )}
      </Card>

      {tools.isLoading ? (
        <Spinner />
      ) : tools.isError ? (
        <Card className="px-6 py-10 text-center text-sm text-[color:var(--color-danger)]">
          Failed to load CLI tools.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {tools.data!.tools.map((t) => (
            <ToolCard key={t.id} tool={t} baseURL={tools.data!.base_url} />
          ))}
        </div>
      )}
    </>
  );
}

function ToolCard({
  tool,
  baseURL,
}: {
  tool: CLITool;
  baseURL: string;
}) {
  const [copied, setCopied] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showConfigure, setShowConfigure] = useState(false);
  const queryClient = useQueryClient();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tool.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; no-op
    }
  };

  const configureMut = useMutation({
    mutationFn: () =>
      api.cliToolConfigure(tool.id, {
        base_url: baseURL,
        api_key: apiKey || "sk_keirouter",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cli-tools"] });
      setShowConfigure(false);
      setApiKey("");
    },
  });

  const removeMut = useMutation({
    mutationFn: () => api.cliToolRemove(tool.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cli-tools"] });
    },
  });

  return (
    <Card>
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            {tool.name}
            {tool.configured ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                configured
              </span>
            ) : tool.installed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <XCircle className="h-3 w-3" />
                not configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                not installed
              </span>
            )}
          </span>
        }
        description={tool.instructions}
        icon={TerminalSquare}
        iconTone="neutral"
        action={
          <div className="flex items-center gap-1">
            {/* Auto-configure button */}
            <button
              onClick={() => setShowConfigure(!showConfigure)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-ink-100 hover:text-[var(--text)] dark:hover:bg-ink-800"
              title="Auto-configure"
            >
              <Settings className="h-4 w-4" />
            </button>
            {/* Remove config button */}
            {tool.configured && (
              <button
                onClick={() => removeMut.mutate()}
                disabled={removeMut.isPending}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                title="Remove KeiRouter config"
              >
                {removeMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            )}
            {/* Copy snippet button */}
            <button
              onClick={copy}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-ink-100 hover:text-[var(--text)] dark:hover:bg-ink-800"
              title="Copy snippet"
            >
              {copied ? (
                <Check className="h-4 w-4 text-accent-600 dark:text-accent-300" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        }
      />

      {/* Auto-configure form */}
      {showConfigure && (
        <div className="mx-6 mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
          <p className="mb-2 text-xs text-[var(--text-muted)]">
            Write KeiRouter config directly into{" "}
            <span className="font-mono">{tool.config_path}</span>
          </p>
          <div className="flex items-end gap-3">
            <Field label="API Key">
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_keirouter"
                className="max-w-xs"
                type="password"
              />
            </Field>
            <button
              onClick={() => configureMut.mutate()}
              disabled={configureMut.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent-600 px-3 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50 dark:bg-accent-500 dark:hover:bg-accent-600"
            >
              {configureMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Settings className="h-3.5 w-3.5" />
              )}
              Configure
            </button>
          </div>
          {configureMut.isError && (
            <p className="mt-2 text-xs text-[color:var(--color-danger)]">
              {(configureMut.error as Error)?.message || "Configuration failed"}
            </p>
          )}
          {configureMut.isSuccess && (
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
              ✓ Configured successfully
            </p>
          )}
        </div>
      )}

      {/* Snippet preview */}
      <div className="px-6 pb-6">
        <pre className="overflow-x-auto rounded-lg bg-[var(--bg-subtle)] p-3 font-mono text-xs leading-relaxed">
          {tool.snippet}
        </pre>
      </div>
    </Card>
  );
}
