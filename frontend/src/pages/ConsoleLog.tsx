import { useEffect, useRef, useState } from "react";
import { ScrollText, Trash2 } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { Card, Button, EmptyState } from "../components/ui";

const LOG_LEVEL_COLORS: Record<string, string> = {
  LOG: "text-green-400 dark:text-green-400",
  INFO: "text-blue-400 dark:text-blue-400",
  WARN: "text-yellow-400 dark:text-yellow-400",
  ERROR: "text-red-400 dark:text-red-400",
  DEBUG: "text-purple-400 dark:text-purple-400",
};

function colorLine(line: string) {
  // Extract level tag from patterns like [INFO] or [ERROR]
  const match = line.match(/\[(\w+)\]/g);
  const levelTag = match ? match[1]?.replace(/\[|\]/g, "") : null;
  const color = LOG_LEVEL_COLORS[levelTag || ""] || "text-green-400 dark:text-green-400";
  return <span className={color}>{line}</span>;
}

export function ConsoleLogPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource("/api/console/stream");

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "init") {
        setLogs(msg.logs || []);
        setLoading(false);
      } else if (msg.type === "line") {
        setLogs((prev) => {
          const next = [...prev, msg.line];
          // Cap at 500 lines.
          return next.length > 500 ? next.slice(-500) : next;
        });
      } else if (msg.type === "clear") {
        setLogs([]);
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => es.close();
  }, []);

  // Auto-scroll to bottom on new logs.
  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const handleClear = async () => {
    try {
      await fetch("/api/console", { method: "DELETE" });
      // UI cleared via SSE "clear" event
    } catch {
      // ignore
    }
  };

  return (
    <>
      <PageHeader
        title="Console Log"
        icon={ScrollText}
        description={
          connected
            ? "Live debug feed — request pipeline output appears here."
            : "Connecting to live stream…"
        }
        action={
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500 dark:bg-green-400" : "bg-[var(--text-muted)]"}`} />
            <Button variant="ghost" onClick={handleClear} disabled={logs.length === 0}>
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>
        }
      />

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-accent-500" />
          </div>
        ) : !logs.length ? (
          <EmptyState
            title="No console logs yet"
            hint="Requests will appear here once traffic flows through KeiRouter."
          />
        ) : (
          <div
            ref={logRef}
            className="rounded-b-2xl bg-black p-4 font-mono text-xs leading-relaxed"
            style={{ height: "calc(100vh - 220px)", overflowY: "auto" }}
          >
            {logs.length === 0 ? (
              <span className="text-[var(--text-muted)]">No console logs yet.</span>
            ) : (
              <div className="space-y-0.5">
                {logs.map((line, i) => (
                  <div key={i}>{colorLine(line)}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
