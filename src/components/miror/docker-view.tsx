"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Container, Image, Network, HardDrive, Play, Square, RotateCw, Trash2,
  RefreshCw, Terminal, ChevronDown, ChevronRight, AlertCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Tab = "containers" | "images" | "networks" | "volumes";

interface ContainerInfo {
  id: string; name: string; image: string; status: string;
  ports: string; createdAt: string; isRunning: boolean;
}
interface ImageInfo {
  repository: string; tag: string; id: string; size: string; createdAt: string;
}
interface NetworkInfo {
  id: string; name: string; driver: string; scope: string;
}
interface VolumeInfo {
  driver: string; name: string;
}

export function DockerView() {
  const [tab, setTab] = useState<Tab>("containers");
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logsContainer, setLogsContainer] = useState<ContainerInfo | null>(null);
  const [execContainer, setExecContainer] = useState<ContainerInfo | null>(null);
  const [containerLogs, setContainerLogs] = useState<string[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fetchContainers = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/docker/containers");
      const data = await res.json();
      if (res.ok) setContainers(data);
      else setError(data.error);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  const fetchImages = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/docker/images");
      const data = await res.json();
      if (res.ok) setImages(data);
      else setError(data.error);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  const fetchNetworks = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/docker/networks");
      const data = await res.json();
      if (res.ok) setNetworks(data);
      else setError(data.error);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  const fetchVolumes = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/docker/volumes");
      const data = await res.json();
      if (res.ok) setVolumes(data);
      else setError(data.error);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "containers") fetchContainers();
    else if (tab === "images") fetchImages();
    else if (tab === "networks") fetchNetworks();
    else if (tab === "volumes") fetchVolumes();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async (containerId: string, action: string) => {
    try {
      await fetch("/api/docker/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerId, action }),
      });
      fetchContainers();
    } catch (e) { setError((e as Error).message); }
  };

  const openLogs = async (container: ContainerInfo) => {
    setLogsContainer(container);
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/docker/logs?containerId=${container.id}&tail=200`);
      const data = await res.json();
      setContainerLogs(data.logs?.map((l: { message: string }) => l.message) || []);
    } catch (e) {
      setContainerLogs([`Error: ${(e as Error).message}`]);
    } finally { setLoadingLogs(false); }
  };

  const TABS: { id: Tab; label: string; icon: typeof Container; count: number }[] = [
    { id: "containers", label: "Containers", icon: Container, count: containers.length },
    { id: "images", label: "Images", icon: Image, count: images.length },
    { id: "networks", label: "Networks", icon: Network, count: networks.length },
    { id: "volumes", label: "Volumes", icon: HardDrive, count: volumes.length },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header with tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all miror-press",
              tab === t.id
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {t.label}
            <span className="font-mono text-[10px] text-muted-foreground/60">{t.count}</span>
          </button>
        ))}
        <Button
          variant="ghost" size="icon" className="h-7 w-7 ml-auto"
          onClick={() => {
            if (tab === "containers") fetchContainers();
            else if (tab === "images") fetchImages();
            else if (tab === "networks") fetchNetworks();
            else fetchVolumes();
          }}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} strokeWidth={1.75} />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="m-3 rounded-lg border border-status-error/30 bg-status-error/5 p-3 text-xs text-status-error flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">{error}</div>
            <div className="text-[11px] mt-0.5 opacity-80">Make sure Docker is installed and the daemon is running.</div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto miror-scroll">
        {/* Containers tab */}
        {tab === "containers" && (
          <div className="p-3 space-y-1.5">
            {containers.map(c => (
              <div
                key={c.id}
                className="group rounded-xl border border-border/50 miror-card p-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "inline-block h-2 w-2 rounded-full shrink-0",
                    c.isRunning ? "bg-status-running" : "bg-status-idle"
                  )} />
                  <span className="text-[13px] font-medium truncate flex-1">{c.name}</span>
                  <Badge variant="outline" className={cn(
                    "text-[10px] h-4 shrink-0",
                    c.isRunning ? "text-status-running border-status-running/30" : "text-muted-foreground"
                  )}>
                    {c.isRunning ? "Up" : "Stopped"}
                  </Badge>
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="font-mono">{c.image}</span>
                  <span>·</span>
                  <span className="font-mono text-[10px]">{c.id.slice(0, 12)}</span>
                  {c.ports && (
                    <>
                      <span>·</span>
                      <span className="font-mono text-[10px] truncate">{c.ports}</span>
                    </>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground/60">{c.createdAt}</div>

                {/* Actions */}
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/30">
                  {c.isRunning ? (
                    <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px] miror-press"
                      onClick={() => handleAction(c.id, "stop")}>
                      <Square className="h-3 w-3" /> Stop
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px] miror-press"
                      onClick={() => handleAction(c.id, "start")}>
                      <Play className="h-3 w-3" /> Start
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px] miror-press"
                    onClick={() => handleAction(c.id, "restart")}>
                    <RotateCw className="h-3 w-3" /> Restart
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px] miror-press"
                    onClick={() => openLogs(c)}>
                    <Terminal className="h-3 w-3" /> Logs
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px] miror-press"
                    onClick={() => setExecContainer(c)}>
                    <ChevronRight className="h-3 w-3" /> Exec
                  </Button>
                  <Button variant="ghost" size="sm"
                    className="h-6 gap-1 text-[11px] miror-press ml-auto opacity-0 group-hover:opacity-100 hover:text-status-error"
                    onClick={() => handleAction(c.id, "rm")}>
                    <Trash2 className="h-3 w-3" /> Remove
                  </Button>
                </div>
              </div>
            ))}
            {containers.length === 0 && !loading && !error && (
              <EmptyState icon={Container} title="No containers" description="Run a container to see it here." />
            )}
          </div>
        )}

        {/* Images tab */}
        {tab === "images" && (
          <div className="p-3 space-y-1">
            {images.map((img, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2">
                <Image className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-medium">{img.repository}:{img.tag}</span>
                  <span className="font-mono text-[10px] text-muted-foreground/60 ml-2">{img.id.slice(0, 12)}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{img.size}</span>
                <span className="text-[10px] text-muted-foreground/50">{img.createdAt}</span>
              </div>
            ))}
            {images.length === 0 && !loading && !error && (
              <EmptyState icon={Image} title="No images" description="Pull an image to see it here." />
            )}
          </div>
        )}

        {/* Networks tab */}
        {tab === "networks" && (
          <div className="p-3 space-y-1">
            {networks.map((net, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2">
                <Network className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-medium">{net.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground/60 ml-2">{net.id.slice(0, 12)}</span>
                </div>
                <Badge variant="outline" className="text-[10px] h-4">{net.driver}</Badge>
                <span className="text-[10px] text-muted-foreground/50">{net.scope}</span>
              </div>
            ))}
            {networks.length === 0 && !loading && !error && (
              <EmptyState icon={Network} title="No networks" description="Create a network to see it here." />
            )}
          </div>
        )}

        {/* Volumes tab */}
        {tab === "volumes" && (
          <div className="p-3 space-y-1">
            {volumes.map((vol, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2">
                <HardDrive className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-medium">{vol.name}</span>
                </div>
                <Badge variant="outline" className="text-[10px] h-4">{vol.driver}</Badge>
              </div>
            ))}
            {volumes.length === 0 && !loading && !error && (
              <EmptyState icon={HardDrive} title="No volumes" description="Create a volume to see it here." />
            )}
          </div>
        )}
      </div>

      {/* Container logs dialog */}
      <Dialog open={!!logsContainer} onOpenChange={(o) => !o && setLogsContainer(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[13px]">
              <Terminal className="h-4 w-4" />
              Logs — {logsContainer?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto miror-scroll rounded-lg bg-black/30 p-3 font-mono text-[11px]">
            {loadingLogs ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading logs…
              </div>
            ) : containerLogs.length > 0 ? (
              containerLogs.map((line, i) => (
                <div key={i} className="text-foreground/80 whitespace-pre-wrap break-all">{line}</div>
              ))
            ) : (
              <div className="text-muted-foreground text-center py-8">No logs available</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Exec dialog */}
      {execContainer && (
        <ExecDialog container={execContainer} onClose={() => setExecContainer(null)} />
      )}
    </div>
  );
}

// --- Exec dialog — run commands inside a container ------------------------

function ExecDialog({ container, onClose }: { container: ContainerInfo; onClose: () => void }) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Array<{ cmd: string; output: string }>>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!input.trim()) return;
    const cmd = input.trim();
    setInput("");
    setHistory(prev => [...prev, { cmd, output: "" }]);
    setLoading(true);
    try {
      const res = await fetch("/api/docker/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerId: container.id, command: cmd }),
      });
      const data = await res.json();
      setHistory(prev => {
        const next = [...prev];
        next[next.length - 1].output = data.output || data.error || "(no output)";
        return next;
      });
    } catch (e) {
      setHistory(prev => {
        const next = [...prev];
        next[next.length - 1].output = String(e);
        return next;
      });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[13px]">
            <Terminal className="h-4 w-4" />
            Exec — {container.name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto miror-scroll rounded-lg bg-black/30 p-3 space-y-2">
          <div className="text-[10px] text-muted-foreground/60 font-mono mb-2">
            Type a command to run inside the container (e.g. "ls -la", "env", "cat /etc/hosts")
          </div>
          {history.map((h, i) => (
            <div key={i}>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="text-primary">$</span>
                <span className="text-foreground/80">{h.cmd}</span>
              </div>
              {h.output && (
                <pre className="font-mono text-[11px] text-muted-foreground/80 whitespace-pre-wrap pl-4 mt-0.5">
                  {h.output}
                </pre>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-border/50 px-3 py-2.5">
          <span className="font-mono text-[12px] text-primary">$</span>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !loading && run()}
            placeholder="ls -la"
            className="flex-1 bg-transparent font-mono text-[12px] outline-none placeholder:text-muted-foreground/40"
            autoFocus
          />
          <Button size="sm" className="h-7 gap-1 text-[12px] miror-press" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Run
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Empty state ----------------------------------------------------------

function EmptyState({ icon: Icon, title, description }: { icon: typeof Container; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/30 mb-3" strokeWidth={1.5} />
      <h3 className="text-[14px] font-medium">{title}</h3>
      <p className="mt-1 text-[12px] text-muted-foreground">{description}</p>
    </div>
  );
}
