"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Keyboard, MousePointer2, Monitor, RefreshCw, Trophy, Clock, TrendingUp,
  Sparkles, Flame, AlertCircle, Loader2, ArrowUp, ArrowDown, Zap, Target,
  Code2, Globe, TerminalSquare, MessageCircle, Figma, Grid3x3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tab = "dashboard" | "apps" | "timeline" | "achievements" | "fun";

// App icon renderer — maps app names to colored circular icons
function AppIcon({ name, color, letter, size = 28 }: { name: string; color: string; letter: string; size?: number }) {
  const iconMap: Record<string, typeof Code2> = {
    "VS Code": Code2,
    "Chrome": Globe,
    "Terminal": TerminalSquare,
    "Discord": MessageCircle,
    "Figma": Figma,
    "Other": Grid3x3,
  };
  const Icon = iconMap[name] || Grid3x3;
  return (
    <div
      className="flex items-center justify-center rounded-lg shrink-0"
      style={{ width: size, height: size, backgroundColor: color + "22" }}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} style={{ color }} />
    </div>
  );
}

interface HourlyData { hour: string; hourNum: number; keys: number; clicks: number; label: string }
interface WeeklyData { day: string; date: string; keys: number; clicks: number; screenMinutes: number; isToday: boolean }
interface StatsData {
  today: { keys: number; clicks: number; screenTime: string; screenMinutes: number; appSwitches: number };
  lifetime: { keys: number; clicks: number; screenHours: number; codeHours: number };
  records: { maxKeysDay: number; maxClicksDay: number; longestSession: string; longestStreak: number };
  fun: { novelsTyped: number; screenDays: number; codeDays: number; mouseKm: string };
  mood: { emoji: string; label: string; desc: string; color: string };
  focusSession: { app: string; duration: string; keys: number; switches: number; message: string; startTime: string; endTime: string };
  hourlyData: HourlyData[];
  weeklyData: WeeklyData[];
  context: { dayName: string; dateStr: string; timeStr: string; currentHour: number };
}
interface AppData {
  apps: Array<{ name: string; timeUsed: string; minutes: number; percentage: number; color: string; letter: string }>;
  totalMinutes: number;
  topApp: { name: string; timeUsed: string; color: string };
}
interface TimelineEvent { time: string; app: string; icon: string; duration: string }
interface Achievement { id: string; icon: string; name: string; desc: string; unlocked: boolean; progress: number }
interface HeatmapData {
  keys: Array<{ key: string; count: number; label: string }>;
  combos: Array<{ combo: string; label: string; count: number; fun: string }>;
}

export function ActivityView() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [appData, setAppData] = useState<AppData | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [achievements, setAchievements] = useState<{ achievements: Achievement[]; unlockedCount: number; totalCount: number } | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingPaused, setTrackingPaused] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true); setError(null);
    try { const res = await fetch("/api/activity/stats"); const d = await res.json(); if (res.ok) setStats(d); else setError(d.error); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);

  const fetchApps = useCallback(async () => {
    setLoading(true); setError(null);
    try { const res = await fetch("/api/activity/apps"); const d = await res.json(); if (res.ok) setAppData(d); else setError(d.error); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);

  const fetchTimeline = useCallback(async () => {
    setLoading(true); setError(null);
    try { const res = await fetch("/api/activity/timeline"); const d = await res.json(); if (res.ok) setTimeline(d.events || []); else setError(d.error); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);

  const fetchAchievements = useCallback(async () => {
    setLoading(true); setError(null);
    try { const res = await fetch("/api/activity/achievements"); const d = await res.json(); if (res.ok) setAchievements(d); else setError(d.error); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);

  const fetchHeatmap = useCallback(async () => {
    setLoading(true); setError(null);
    try { const res = await fetch("/api/activity/heatmap"); const d = await res.json(); if (res.ok) setHeatmap(d); else setError(d.error); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "dashboard") fetchStats();
    else if (tab === "apps") fetchApps();
    else if (tab === "timeline") fetchTimeline();
    else if (tab === "achievements") fetchAchievements();
    else if (tab === "fun") { fetchStats(); fetchHeatmap(); }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const TABS: { id: Tab; label: string; icon: typeof Keyboard }[] = [
    { id: "dashboard", label: "Dashboard", icon: TrendingUp },
    { id: "apps", label: "Apps", icon: Monitor },
    { id: "timeline", label: "Timeline", icon: Clock },
    { id: "achievements", label: "Achievements", icon: Trophy },
    { id: "fun", label: "Fun Stats", icon: Sparkles },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all mir-press",
              tab === t.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
            <t.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px] mir-press"
            onClick={() => setTrackingPaused(!trackingPaused)}>
            {trackingPaused ? "▶ Resume" : "⏸ Pause"}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => { if (tab === "dashboard") fetchStats(); else if (tab === "apps") fetchApps(); else if (tab === "timeline") fetchTimeline(); else if (tab === "achievements") fetchAchievements(); else { fetchStats(); fetchHeatmap(); } }}
            disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} strokeWidth={1.75} />
          </Button>
        </div>
      </div>

      {/* Privacy note */}
      <div className="mx-3 mt-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground/70">
        🔒 This feature only counts keyboard and mouse activity. It does not record what you type. All data stays local.
      </div>

      {error && (
        <div className="m-3 rounded-lg border border-status-error/30 bg-status-error/5 p-3 text-xs text-status-error flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-auto mir-scroll">
        {loading && <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

        {/* ===== DASHBOARD ===== */}
        {!loading && tab === "dashboard" && stats && (
          <div className="p-4 space-y-4">
            {/* Date/time header */}
            <div className="flex items-center gap-2 text-[13px]">
              <span className="font-semibold">{stats.context.dayName}</span>
              <span className="text-muted-foreground">· {stats.context.dateStr}</span>
              <span className="text-muted-foreground/50">· {stats.context.timeStr}</span>
            </div>

            {/* Today's counters — big colorful cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <BigCounter icon={Keyboard} label="Keys Today" value={stats.today.keys.toLocaleString()} color="#007AFF" subtext="⌨️ key presses" />
              <BigCounter icon={MousePointer2} label="Clicks Today" value={stats.today.clicks.toLocaleString()} color="#34C759" subtext="🖱️ mouse clicks" />
              <BigCounter icon={Monitor} label="Screen Time" value={stats.today.screenTime} color="#FF9500" subtext="🖥️ active usage" />
              <BigCounter icon={Zap} label="App Switches" value={stats.today.appSwitches.toString()} color="#5856D6" subtext="🔄 times" />
            </div>

            {/* Hourly bar chart */}
            <Card className="mir-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[11px] font-medium text-muted-foreground">Today's Activity (keys per hour)</div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-primary" /> Keys</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-status-running" /> Clicks</span>
                  </div>
                </div>
                <div className="flex items-end gap-1 h-32">
                  {stats.hourlyData.map((h, i) => {
                    const maxKeys = Math.max(...stats.hourlyData.map(d => d.keys), 1);
                    const keysH = (h.keys / maxKeys) * 100;
                    const clicksH = (h.clicks / maxKeys) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group">
                        <div className="relative flex-1 w-full flex flex-col justify-end gap-px">
                          <div className="w-full rounded-t-sm bg-primary/80 transition-all group-hover:bg-primary"
                            style={{ height: `${keysH}%` }} title={`${h.keys} keys`} />
                          <div className="w-full rounded-b-sm bg-status-running/60 transition-all group-hover:bg-status-running"
                            style={{ height: `${clicksH}%` }} title={`${h.clicks} clicks`} />
                        </div>
                        <span className="text-[8px] text-muted-foreground/50 font-mono">{h.label}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Dev Mood + Focus Session */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="mir-card">
                <CardContent className="p-4">
                  <div className="text-[11px] font-medium text-muted-foreground mb-2">Dev Mood</div>
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{stats.mood.emoji}</span>
                    <div>
                      <div className="text-[15px] font-semibold" style={{ color: stats.mood.color }}>{stats.mood.label}</div>
                      <div className="text-[11px] text-muted-foreground">{stats.mood.desc}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="mir-card border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <Flame className="h-3 w-3 text-status-starting" /> Focus Session
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">{stats.focusSession.startTime} → {stats.focusSession.endTime}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AppIcon name="VS Code" color="#0098FF" letter="VS" size={36} />
                    <div className="flex-1">
                      <div className="text-[14px] font-semibold">{stats.focusSession.app} · {stats.focusSession.duration}</div>
                      <div className="text-[11px] text-muted-foreground">{stats.focusSession.keys.toLocaleString()} keys · {stats.focusSession.switches} switches</div>
                      <div className="text-[12px] text-primary font-medium mt-0.5">"{stats.focusSession.message}"</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Weekly trend chart */}
            <Card className="mir-card">
              <CardContent className="p-4">
                <div className="text-[11px] font-medium text-muted-foreground mb-3">This Week (keys per day)</div>
                <div className="flex items-end gap-2 h-28">
                  {stats.weeklyData.map((d, i) => {
                    const maxKeys = Math.max(...stats.weeklyData.map(w => w.keys), 1);
                    const h = (d.keys / maxKeys) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                        <div className="text-[8px] text-muted-foreground/0 group-hover:text-muted-foreground transition-all">
                          {(d.keys / 1000).toFixed(1)}K
                        </div>
                        <div className="flex-1 w-full flex flex-col justify-end">
                          <div
                            className={cn("w-full rounded-t-md transition-all group-hover:opacity-80",
                              d.isToday ? "bg-primary" : "bg-primary/40")}
                            style={{ height: `${h}%` }}
                          />
                        </div>
                        <span className={cn("text-[9px] font-medium", d.isToday ? "text-primary" : "text-muted-foreground/60")}>{d.day}</span>
                        <span className="text-[8px] text-muted-foreground/40">{d.date.split(" ")[1]}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Records */}
            <Card className="mir-card">
              <CardContent className="p-4">
                <div className="text-[11px] font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Trophy className="h-3 w-3" /> Personal Records
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <RecordStat icon="🔥" label="Most keys/day" value={stats.records.maxKeysDay.toLocaleString()} />
                  <RecordStat icon="🖱️" label="Most clicks/day" value={stats.records.maxClicksDay.toLocaleString()} />
                  <RecordStat icon="🏆" label="Longest session" value={stats.records.longestSession} />
                  <RecordStat icon="📅" label="Longest streak" value={`${stats.records.longestStreak} days`} />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ===== APPS ===== */}
        {!loading && tab === "apps" && appData && (
          <div className="p-4 space-y-3">
            <div className="text-[13px] font-semibold">Today's App Usage · <span className="text-muted-foreground font-normal">{appData.totalMinutes > 60 ? `${Math.floor(appData.totalMinutes / 60)}h ${appData.totalMinutes % 60}m` : `${appData.totalMinutes}m`} total</span></div>
            <Card className="mir-card">
              <CardContent className="p-4 space-y-3">
                {appData.apps.map((app, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <AppIcon name={app.name} color={app.color} letter={app.letter} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[12px] font-medium">{app.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{app.timeUsed} · {app.percentage}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${app.percentage}%`, backgroundColor: app.color }} />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t border-border/30 text-[11px] text-muted-foreground">
                  🏆 Top app today: <span className="text-foreground font-medium">{appData.topApp.name}</span> · {appData.topApp.timeUsed}
                  <br />📅 Top app this week: <span className="text-foreground font-medium">{appData.topAppWeek}</span>
                  <br />📆 Top app this month: <span className="text-foreground font-medium">{appData.topAppMonth}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ===== TIMELINE ===== */}
        {!loading && tab === "timeline" && (
          <div className="p-4">
            <div className="text-[13px] font-semibold mb-3">Day Replay · <span className="text-muted-foreground font-normal">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span></div>
            <div className="space-y-0.5">
              {timeline.map((event, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/30 group">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="h-2.5 w-2.5 rounded-full bg-primary/60 ring-2 ring-primary/20" />
                    {i < timeline.length - 1 && <div className="w-px h-8 bg-border/50" />}
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground w-12 shrink-0">{event.time}</span>
                  <span className="text-xl shrink-0">{event.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] font-medium">{event.app}</span>
                    <span className="text-[11px] text-muted-foreground ml-2">· {event.duration}</span>
                  </div>
                </div>
              ))}
              {timeline.length === 0 && !loading && <div className="text-center py-8 text-[12px] text-muted-foreground">No activity recorded yet</div>}
            </div>
          </div>
        )}

        {/* ===== ACHIEVEMENTS ===== */}
        {!loading && tab === "achievements" && achievements && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-[13px]">
              <Trophy className="h-4 w-4 text-status-starting" />
              <span className="font-semibold">{achievements.unlockedCount} / {achievements.totalCount}</span>
              <span className="text-muted-foreground text-[12px]">unlocked</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {achievements.achievements.map(a => (
                <div key={a.id} className={cn("rounded-xl border p-3 transition-all", a.unlocked ? "border-status-starting/30 bg-status-starting/5" : "border-border/50 opacity-60")}>
                  <div className="flex items-center gap-2.5">
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-xl", a.unlocked ? "bg-status-starting/15" : "bg-muted/40 grayscale")}>
                      {a.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium">{a.name}</div>
                      <div className="text-[10px] text-muted-foreground">{a.desc}</div>
                    </div>
                    {a.unlocked && <Badge variant="outline" className="text-status-starting border-status-starting/30 text-[9px] h-5">✓ Earned</Badge>}
                  </div>
                  {!a.unlocked && a.progress > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${a.progress * 100}%` }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground/60 font-mono">{Math.round(a.progress * 100)}%</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== FUN STATS ===== */}
        {!loading && tab === "fun" && stats && heatmap && (
          <div className="p-4 space-y-4">
            {/* Lifetime stats — big colorful numbers */}
            <Card className="mir-card">
              <CardContent className="p-4">
                <div className="text-[11px] font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" /> Lifetime Developer Stats
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <BigStat icon="⌨️" value={stats.lifetime.keys.toLocaleString()} label="keys pressed" color="#007AFF" />
                  <BigStat icon="🖱️" value={stats.lifetime.clicks.toLocaleString()} label="mouse clicks" color="#34C759" />
                  <BigStat icon="🖥️" value={`${stats.lifetime.screenHours}h`} label="screen time" color="#FF9500" />
                  <BigStat icon="💻" value={`${stats.lifetime.codeHours}h`} label="in IDEs" color="#5856D6" />
                </div>
              </CardContent>
            </Card>

            {/* Fun comparisons */}
            <Card className="mir-card">
              <CardContent className="p-4">
                <div className="text-[11px] font-medium text-muted-foreground mb-3">Fun Comparisons 😄</div>
                <div className="space-y-2.5">
                  <FunRow icon="⌨️" value={stats.fun.novelsTyped.toString()} unit="novels" text="You typed enough to write" color="#007AFF" />
                  <FunRow icon="🖥️" value={stats.fun.screenDays.toString()} unit="full days" text="Screen time equals" color="#FF9500" />
                  <FunRow icon="💻" value={stats.fun.codeDays.toString()} unit="days nonstop" text="Coding time equals" color="#5856D6" />
                  <FunRow icon="🖱️" value={stats.fun.mouseKm} unit="km" text="Your mouse traveled" color="#34C759" />
                </div>
              </CardContent>
            </Card>

            {/* Keyboard heatmap */}
            <Card className="mir-card">
              <CardContent className="p-4">
                <div className="text-[11px] font-medium text-muted-foreground mb-3">Keyboard Heatmap (Top 20 Keys)</div>
                <div className="flex flex-wrap gap-1.5">
                  {heatmap.keys.slice(0, 20).map((k, i) => {
                    const max = heatmap.keys[0].count;
                    const intensity = k.count / max;
                    return (
                      <div key={i} className="rounded-lg px-2.5 py-1.5 text-center transition-all hover:scale-105 cursor-default"
                        style={{ backgroundColor: `rgba(0, 122, 255, ${intensity * 0.7 + 0.08})`, fontSize: `${10 + intensity * 5}px` }}
                        title={`${k.count.toLocaleString()} presses`}>
                        <div className="font-mono font-bold text-white">{k.label}</div>
                        <div className="text-[8px] text-white/50">{formatCount(k.count)}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Shortcut stats */}
            <Card className="mir-card">
              <CardContent className="p-4">
                <div className="text-[11px] font-medium text-muted-foreground mb-3">Shortcut Stats 🔧</div>
                <div className="space-y-1.5">
                  {heatmap.combos.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 text-[12px] py-1">
                      <span className="font-mono font-bold text-primary w-24 shrink-0 text-[11px]">{c.combo}</span>
                      <span className="text-muted-foreground flex-1 text-[11px]">{c.fun}</span>
                      <span className="font-mono text-[10px] text-muted-foreground/50">{formatCount(c.count)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Helper components ---

function BigCounter({ icon: Icon, label, value, color, subtext }: { icon: typeof Keyboard; label: string; value: string; color: string; subtext: string }) {
  return (
    <Card className="mir-card overflow-hidden">
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: color + "22" }}>
            <Icon className="h-4 w-4" strokeWidth={2} style={{ color }} />
          </div>
          <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
        </div>
        <div className="mt-1.5 text-2xl font-bold tabular-nums" style={{ color }}>{value}</div>
        <div className="text-[9px] text-muted-foreground/60">{subtext}</div>
      </CardContent>
    </Card>
  );
}

function RecordStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl mb-0.5">{icon}</div>
      <div className="text-[15px] font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function BigStat({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl mb-1">{icon}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function FunRow({ icon, value, unit, text, color }: { icon: string; value: string; unit: string; text: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-2xl shrink-0">{icon}</span>
      <div className="flex-1">
        <span className="text-[12px] text-muted-foreground">{text} </span>
        <span className="text-[14px] font-bold" style={{ color }}>{value}</span>
        <span className="text-[12px] text-muted-foreground"> {unit}</span>
      </div>
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}
