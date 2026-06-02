import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Calendar,
  Zap,
  RefreshCw,
  Filter,
  ChevronDown,
} from "lucide-react";
import { api, type QuotaAccount, type UpstreamQuota } from "../lib/api";
import { PageHeader } from "../components/Layout";
import {
  Card,
  Spinner,
  EmptyState,
  Badge,
  StatusDot,
  Button,
} from "../components/ui";
import { useToast } from "../components/Toast";

const periods = [
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
];

const statusMeta: Record<
  string,
  { label: string; tone: "success" | "warning" | "danger" }
> = {
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  needs_attention: { label: "Needs attention", tone: "danger" },
};

const QUOTA_COLORS = {
  high: {
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500",
    bgLight: "bg-emerald-500/10",
    emoji: "🟢",
  },
  medium: {
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500",
    bgLight: "bg-amber-500/10",
    emoji: "🟡",
  },
  low: {
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500",
    bgLight: "bg-red-500/10",
    emoji: "🔴",
  },
};

function getQuotaColor(remainingPct: number) {
  if (remainingPct > 70) return QUOTA_COLORS.high;
  if (remainingPct >= 30) return QUOTA_COLORS.medium;
  return QUOTA_COLORS.low;
}

function formatResetTime(resetAt: string | undefined | null): string | null {
  if (!resetAt) return null;
  try {
    const date = new Date(resetAt);
    if (isNaN(date.getTime())) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let dayStr: string;
    if (date >= today && date < tomorrow) {
      dayStr = "Today";
    } else if (
      date >= tomorrow &&
      date < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
    ) {
      dayStr = "Tomorrow";
    } else {
      dayStr = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }

    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    return `${dayStr}, ${timeStr}`;
  } catch {
    return null;
  }
}

export function QuotaPage() {
  const [period, setPeriod] = useState("month");
  const [providerFilter, setProviderFilter] = useState("all");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  const quota = useQuery({
    queryKey: ["quota", period],
    queryFn: () => api.quota(period),
  });

  const accounts = quota.data?.accounts ?? [];

  // Get unique providers for filter
  const providers = [
    ...new Set(accounts.map((a) => a.provider)),
  ].sort();

  // Filter accounts by provider
  const filteredAccounts =
    providerFilter === "all"
      ? accounts
      : accounts.filter((a) => a.provider === providerFilter);

  // Sort: accounts with quota first, then by remaining percentage
  const sortedAccounts = [...filteredAccounts].sort((a, b) => {
    const aHasQuota = a.upstream_quotas && a.upstream_quotas.length > 0;
    const bHasQuota = b.upstream_quotas && b.upstream_quotas.length > 0;
    if (aHasQuota && !bHasQuota) return -1;
    if (!aHasQuota && bHasQuota) return 1;

    const aRemaining = a.upstream_quotas?.[0]
      ? a.upstream_quotas[0].remaining / Math.max(1, a.upstream_quotas[0].limit)
      : 1;
    const bRemaining = b.upstream_quotas?.[0]
      ? b.upstream_quotas[0].remaining / Math.max(1, b.upstream_quotas[0].limit)
      : 1;

    return aRemaining - bRemaining;
  });

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ["quota"] });
    toast.success("Refreshed", "Quota data updated.");
  };

  return (
    <>
      <PageHeader
        title="Quota Tracker"
        icon={Clock}
        description="Monitor upstream quota limits and consumption per connected account."
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 shadow-[var(--shadow-card)]">
              <Calendar className="h-4 w-4 text-[var(--text-muted)]" />
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="bg-transparent text-sm font-medium focus:outline-none"
              >
                {periods.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="ghost" onClick={handleRefresh} className="px-3">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* Provider Filter */}
      {providers.length > 1 && (
        <div className="mb-4 flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu((prev) => !prev)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-xs font-medium transition-colors hover:bg-[var(--bg-subtle)]"
            >
              <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span className="capitalize">
                {providerFilter === "all" ? "All providers" : providerFilter}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            </button>

            {showFilterMenu && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowFilterMenu(false)}
                />
                <div className="absolute left-0 z-40 mt-1 w-48 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-lg">
                  <button
                    onClick={() => {
                      setProviderFilter("all");
                      setShowFilterMenu(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-subtle)] ${
                      providerFilter === "all"
                        ? "text-accent-600 font-medium"
                        : ""
                    }`}
                  >
                    All providers
                  </button>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  {providers.map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setProviderFilter(p);
                        setShowFilterMenu(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm capitalize transition-colors hover:bg-[var(--bg-subtle)] ${
                        providerFilter === p
                          ? "text-accent-600 font-medium"
                          : ""
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            {sortedAccounts.length} account{sortedAccounts.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Accounts Grid */}
      {quota.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : sortedAccounts.length === 0 ? (
        <Card>
          <EmptyState
            title="No connected accounts"
            hint="Add a provider account to start tracking quota usage."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sortedAccounts.map((account) => (
            <QuotaCard key={account.id} account={account} />
          ))}
        </div>
      )}

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-[var(--text-muted)]">
        <Clock className="h-3.5 w-3.5" />
        Quota data refreshes automatically every 60 seconds.
      </p>
    </>
  );
}

function QuotaCard({ account }: { account: QuotaAccount }) {
  const meta = statusMeta[account.status] ?? statusMeta.active;
  const quotas = account.upstream_quotas ?? [];
  const hasQuota = quotas.length > 0;
  const hasPricing = account.input_per_m > 0 || account.output_per_m > 0;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold capitalize">
                {account.provider_name}
              </span>
              {account.plan_name && (
                <Badge tone="accent">{account.plan_name}</Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
              {account.label || "No label"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1">
              <StatusDot tone={meta.tone} />
              <span className="text-[11px] font-medium">{meta.label}</span>
            </span>
            <Badge tone="neutral">
              {account.auth_kind === "oauth" ? "OAuth" : "API Key"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Quota Content */}
      <div className="px-4 py-3">
        {hasQuota ? (
          <div className="space-y-3">
            {quotas.map((quota) => (
              <QuotaBar key={quota.resource_type} quota={quota} />
            ))}
            {account.message && (
              <p className="text-[11px] text-[var(--text-muted)]">
                {account.message}
              </p>
            )}
          </div>
        ) : (
          <div className="py-4 text-center">
            <Zap className="mx-auto h-8 w-8 text-[var(--text-muted)] opacity-30" />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              No upstream quota data available
            </p>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="border-t border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)]">
              {account.total_requests.toLocaleString()} requests
            </span>
            {hasPricing && (
              <span className="text-[var(--text-muted)]">
                ${account.input_per_m.toFixed(2)}/${account.output_per_m.toFixed(2)} per 1M
              </span>
            )}
          </div>
          <span className="font-medium tabular-nums">
            ${account.cost_usd.toFixed(2)}
          </span>
        </div>
      </div>
    </Card>
  );
}

function QuotaBar({ quota }: { quota: UpstreamQuota }) {
  const usedPct =
    quota.limit > 0
      ? Math.min(100, Math.round((quota.used / quota.limit) * 100))
      : 0;
  const remainingPct =
    quota.limit > 0
      ? Math.round((quota.remaining / quota.limit) * 100)
      : 0;
  const colors = getQuotaColor(remainingPct);
  const resetDisplay = formatResetTime(quota.reset_at);

  const label = quota.resource_type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div>
      {/* Label Row */}
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px]">{colors.emoji}</span>
          <span className="text-xs font-medium">{label}</span>
        </div>
        <span className={`text-xs font-semibold ${colors.text}`}>
          {remainingPct}%
        </span>
      </div>

      {/* Progress Bar */}
      <div
        className={`h-2 overflow-hidden rounded-full border ${colors.bgLight} ${
          remainingPct === 0
            ? "border-[var(--border)]"
            : "border-transparent"
        }`}
      >
        <div
          className={`h-full transition-all duration-300 ${colors.bg}`}
          style={{ width: `${Math.max(2, usedPct)}%` }}
        />
      </div>

      {/* Stats Row */}
      <div className="mt-1.5 flex items-center justify-between text-[11px]">
        <span className="text-[var(--text-muted)]">
          {quota.used.toLocaleString()} /{" "}
          {quota.limit > 0 ? quota.limit.toLocaleString() : "∞"}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)]">
            {quota.remaining.toLocaleString()} left
          </span>
          {resetDisplay && (
            <span className="text-[var(--text-muted)]">
              • resets {resetDisplay}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
