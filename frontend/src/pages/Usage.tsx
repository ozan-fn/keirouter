import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ReactFlow,
  Handle,
  Position,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Activity, DollarSign, Zap } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { api, type ProviderUsage, type RecentActivity } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { Card, Spinner, ErrorCard } from "../components/ui";

const periods = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "week", label: "7D" },
  { value: "month", label: "30D" },
];

export function UsagePage() {
  const [period, setPeriod] = useState("today");
  const insights = useQuery({
    queryKey: ["usage-insights", period],
    queryFn: () => api.usageInsights(period),
  });

  return (
    <>
      <PageHeader
        title="Usage"
        icon={Activity}
        description="Monitor request flow and provider distribution."
        action={
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p.value
                    ? "bg-accent-600 text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {insights.isLoading ? (
        <Spinner />
      ) : insights.isError ? (
        <ErrorCard message="Failed to load usage. Is the backend running?" />
      ) : (
        <UsageContent data={insights.data!} />
      )}
    </>
  );
}

function UsageContent({ data }: { data: any }) {
  const { summary, providers, recent, series } = data;

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <OverviewCard label="Requests" value={fmtNum(summary.total_requests)} icon={Activity} color="accent" />
        <OverviewCard label="Input Tokens" value={fmtNum(summary.prompt_tokens)} icon={Zap} color="blue" />
        <OverviewCard label="Output Tokens" value={fmtNum(summary.completion_tokens)} icon={Zap} color="green" />
        <OverviewCard label="Est. Cost" value={`$${summary.cost_usd.toFixed(2)}`} icon={DollarSign} color="amber" />
      </div>

      {/* Main content: topology + recent */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        {/* Provider topology */}
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-3">
            <h3 className="text-sm font-semibold">Routing Topology</h3>
          </div>
          <ProviderTopology providers={providers} />
        </Card>

        {/* Recent requests */}
        <Card className="flex h-[420px] flex-col overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-3">
            <h3 className="text-sm font-semibold">Recent Requests</h3>
          </div>
          {!recent.length ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
              No requests yet
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--bg)]">
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-4 py-2 text-left font-medium text-[var(--text-muted)]" />
                    <th className="px-4 py-2 text-left font-medium text-[var(--text-muted)]">Model</th>
                    <th className="px-4 py-2 text-right font-medium text-[var(--text-muted)]">Tokens</th>
                    <th className="px-4 py-2 text-right font-medium text-[var(--text-muted)]">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {recent.map((r: RecentActivity) => (
                    <RecentRow key={r.id} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Activity chart */}
      <Card>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h3 className="text-sm font-semibold">Activity</h3>
          <span className="text-xs text-[var(--text-muted)]">avg {summary.avg_latency_ms}ms</span>
        </div>
        <div className="h-32 px-2 pb-3 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4a7a6f" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#4a7a6f" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="count" stroke="#4a7a6f" strokeWidth={2} fill="url(#usageFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

// ---- Overview Card ----------------------------------------------------------

function OverviewCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    accent: "bg-accent-100 text-accent-700 dark:bg-accent-800/40 dark:text-accent-200",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-800/40 dark:text-blue-200",
    green: "bg-green-100 text-green-700 dark:bg-green-800/40 dark:text-green-200",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-800/40 dark:text-amber-200",
  };

  return (
    <Card className="flex items-center gap-3 px-4 py-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colorMap[color] || colorMap.accent}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-lg font-bold tabular-nums">{value}</p>
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
      </div>
    </Card>
  );
}

// ---- React Flow Topology ----------------------------------------------------

// Center router node component
function RouterNode({ data }: { data: any }) {
  return (
    <div className="flex flex-col items-center">
      <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />
      <div className="flex items-center justify-center rounded-xl border-2 border-accent-500 bg-accent-50 px-5 py-3 shadow-md dark:bg-accent-900/30">
        <img src="/keirouter-logo.png" alt="KeiRouter" className="mr-2 h-6 w-6 object-contain" />
        <span className="text-sm font-bold text-accent-700 dark:text-accent-300">KeiRouter</span>
        {data.activeCount > 0 && (
          <span className="ml-2 rounded-full bg-accent-600 px-1.5 py-0.5 text-xs font-bold text-white">
            {data.activeCount}
          </span>
        )}
      </div>
    </div>
  );
}

// Provider node component
function ProviderNode({ data }: { data: any }) {
  const { label, color, imageUrl, textIcon, sharePct } = data;
  const [imgError, setImgError] = useState(false);
  const isActive = sharePct > 20;

  return (
    <div
      className="flex items-center gap-2.5 rounded-lg border-2 bg-[var(--bg-elevated)] px-4 py-2.5 transition-all duration-300"
      style={{
        borderColor: isActive ? color : "var(--border)",
        boxShadow: isActive ? `0 0 16px ${color}40` : "none",
        minWidth: "150px",
      }}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

      {/* Provider icon */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: `${color}15` }}
      >
        {!imgError && imageUrl ? (
          <img src={imageUrl} alt={label} className="h-6 w-6 rounded-sm object-contain" onError={() => setImgError(true)} />
        ) : (
          <span className="text-sm font-bold" style={{ color }}>{textIcon}</span>
        )}
      </div>

      {/* Provider name + stats */}
      <div className="min-w-0">
        <span
          className="block truncate text-sm font-medium"
          style={{ color: isActive ? color : "var(--text)" }}
        >
          {label}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">{sharePct.toFixed(1)}% traffic</span>
      </div>

      {/* Active indicator */}
      {isActive && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: color }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        </span>
      )}
    </div>
  );
}

const nodeTypes = { router: RouterNode, provider: ProviderNode };

function buildLayout(providers: ProviderUsage[]) {
  const count = providers.length;

  if (count === 0) {
    return {
      nodes: [{ id: "router", type: "router", position: { x: 0, y: 0 }, data: { activeCount: 0 } }],
      edges: [],
    };
  }

  const nodeW = 180;
  const nodeGap = 24;
  const minRx = ((nodeW + nodeGap) * count) / (2 * Math.PI);
  const rx = Math.max(280, minRx);
  const ry = Math.max(160, rx * 0.55);

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Center router node
  nodes.push({
    id: "router",
    type: "router",
    position: { x: -60, y: -22 },
    data: { activeCount: providers.filter((p) => p.share_pct > 20).length },
    draggable: false,
  });

  // Provider nodes arranged in an ellipse
  providers.forEach((p, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
    const cx = rx * Math.cos(angle);
    const cy = ry * Math.sin(angle);

    const nodeId = `provider-${p.provider}`;
    const color = p.color || "#6b7280";
    const isActive = p.share_pct > 20;
    const isLast = !isActive && i === 0;

    nodes.push({
      id: nodeId,
      type: "provider",
      position: { x: cx - nodeW / 2, y: cy - 18 },
      data: {
        label: p.display_name,
        color,
        imageUrl: `/providers/${p.provider}.png`,
        textIcon: p.display_name.slice(0, 2).toUpperCase(),
        sharePct: p.share_pct,
      },
      draggable: false,
    });

    // Pick source handle based on angle
    let sourceHandle = "right";
    if (Math.abs(angle + Math.PI / 2) < Math.PI / 4) sourceHandle = "top";
    else if (Math.abs(angle - Math.PI / 2) < Math.PI / 4) sourceHandle = "bottom";
    else if (cx > 0) sourceHandle = "right";
    else sourceHandle = "left";

    const targetHandle = sourceHandle === "top" ? "bottom" : sourceHandle === "bottom" ? "top" : sourceHandle === "left" ? "right" : "left";

    // Edge style based on state
    let edgeStyle = { stroke: "var(--border)", strokeWidth: 1, opacity: 0.3 };
    if (isActive) edgeStyle = { stroke: color, strokeWidth: 2.5, opacity: 0.9 };
    else if (isLast) edgeStyle = { stroke: color, strokeWidth: 2, opacity: 0.6 };

    edges.push({
      id: `e-${nodeId}`,
      source: "router",
      sourceHandle,
      target: nodeId,
      targetHandle,
      animated: isActive,
      style: edgeStyle,
    });
  });

  return { nodes, edges };
}

function ProviderTopology({ providers }: { providers: ProviderUsage[] }) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => buildLayout(providers), [providers]);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const rfInstance = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Re-fit when nodes change
  useEffect(() => {
    if (rfInstance.current) {
      const id = setTimeout(() => rfInstance.current?.fitView({ padding: 0.2, duration: 200 }), 50);
      return () => clearTimeout(id);
    }
  }, [nodes.length]);

  const onInit = useCallback((instance: any) => {
    rfInstance.current = instance;
    setTimeout(() => instance.fitView({ padding: 0.2, duration: 200 }), 50);
  }, []);

  // Re-fit on resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => rfInstance.current?.fitView({ padding: 0.2 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!providers.length) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--text-muted)]">
        No routing activity yet
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-[400px] w-full min-w-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        panOnDrag
        zoomOnScroll={false}
        zoomOnPinch
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

// ---- Recent Row -------------------------------------------------------------

function RecentRow({ row }: { row: RecentActivity }) {
  return (
    <tr className="hover:bg-[var(--bg-subtle)] transition-colors">
      <td className="px-4 py-2">
        <span className={`block h-1.5 w-1.5 rounded-full ${row.latency_ms > 0 ? "bg-green-500" : "bg-red-500"}`} />
      </td>
      <td className="px-4 py-2 font-mono text-[var(--text)]">{row.model || "—"}</td>
      <td className="px-4 py-2 text-right tabular-nums text-[var(--text-muted)]">
        <span className="text-blue-500">{fmtNum(Math.round(row.tokens * 0.6))}↑</span>{" "}
        <span className="text-green-500">{fmtNum(Math.round(row.tokens * 0.4))}↓</span>
      </td>
      <td className="px-4 py-2 text-right text-[var(--text-muted)]">{relTime(row.created_at)}</td>
    </tr>
  );
}

// ---- Helpers ----------------------------------------------------------------

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
