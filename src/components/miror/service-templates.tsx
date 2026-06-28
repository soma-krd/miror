"use client";

import { useState } from "react";
import {
  BookTemplate, Plus, ArrowRight, X, Zap,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Service, Shell } from "@/lib/types";
import { useMiror } from "@/store/miror-store";
import { cn } from "@/lib/utils";

// Service Templates — pre-built service configs for common dev stacks.
// One click adds a fully-configured service with the right command, env, and
// health probe. Saves the developer from looking up "what's the dev command
// for NestJS again?"

interface TemplateDef {
  id: string;
  name: string;
  icon: string;
  category: "frontend" | "backend" | "database" | "worker" | "mobile" | "infra";
  description: string;
  service: {
    name: string;
    cwd: string;
    command: string;
    shell: Shell;
    env: Record<string, string>;
    autoStart: boolean;
    dependsOn: string[];
  };
  healthProbe: { type: string; pattern?: string; path?: string; port?: number };
  tags: string[];
}

const TEMPLATES: TemplateDef[] = [
  {
    id: "nextjs",
    name: "Next.js",
    icon: "▲",
    category: "frontend",
    description: "React framework with hot reload",
    service: {
      name: "Next.js App",
      cwd: ".",
      command: "npm run dev",
      shell: "bash",
      env: { PORT: "3000" },
      autoStart: false,
      dependsOn: [],
    },
    healthProbe: { type: "log", pattern: "Ready" },
    tags: ["react", "ssr", "typescript"],
  },
  {
    id: "vite",
    name: "Vite",
    icon: "⚡",
    category: "frontend",
    description: "Fast build tool for React/Vue/Svelte",
    service: {
      name: "Vite App",
      cwd: ".",
      command: "npm run dev",
      shell: "bash",
      env: {},
      autoStart: false,
      dependsOn: [],
    },
    healthProbe: { type: "log", pattern: "Local:" },
    tags: ["react", "vue", "svelte", "spa"],
  },
  {
    id: "nestjs",
    name: "NestJS",
    icon: "🐱",
    category: "backend",
    description: "TypeScript Node.js framework",
    service: {
      name: "NestJS API",
      cwd: ".",
      command: "npm run start:dev",
      shell: "bash",
      env: { PORT: "3001", NODE_ENV: "development" },
      autoStart: false,
      dependsOn: [],
    },
    healthProbe: { type: "log", pattern: "Nest application successfully started" },
    tags: ["node", "typescript", "api"],
  },
  {
    id: "express",
    name: "Express",
    icon: "🚂",
    category: "backend",
    description: "Minimal Node.js web framework",
    service: {
      name: "Express Server",
      cwd: ".",
      command: "node index.js",
      shell: "bash",
      env: { PORT: "3001", NODE_ENV: "development" },
      autoStart: false,
      dependsOn: [],
    },
    healthProbe: { type: "log", pattern: "listening" },
    tags: ["node", "javascript", "api"],
  },
  {
    id: "rails",
    name: "Ruby on Rails",
    icon: "💎",
    category: "backend",
    description: "Ruby full-stack framework",
    service: {
      name: "Rails Server",
      cwd: ".",
      command: "bundle exec rails server",
      shell: "bash",
      env: { PORT: "3000", RAILS_ENV: "development" },
      autoStart: false,
      dependsOn: [],
    },
    healthProbe: { type: "log", pattern: "Use Ctrl-C to stop" },
    tags: ["ruby", "api", "mvc"],
  },
  {
    id: "django",
    name: "Django",
    icon: "🎯",
    category: "backend",
    description: "Python web framework",
    service: {
      name: "Django Server",
      cwd: ".",
      command: "python manage.py runserver",
      shell: "bash",
      env: { DJANGO_SETTINGS_MODULE: "settings" },
      autoStart: false,
      dependsOn: [],
    },
    healthProbe: { type: "log", pattern: "Starting development server" },
    tags: ["python", "api", "mvc"],
  },
  {
    id: "fastapi",
    name: "FastAPI",
    icon: "🚀",
    category: "backend",
    description: "Modern Python API framework",
    service: {
      name: "FastAPI Server",
      cwd: ".",
      command: "uvicorn main:app --reload",
      shell: "bash",
      env: {},
      autoStart: false,
      dependsOn: [],
    },
    healthProbe: { type: "log", pattern: "Uvicorn running" },
    tags: ["python", "api", "async"],
  },
  {
    id: "rust-axum",
    name: "Rust (Axum)",
    icon: "🦀",
    category: "backend",
    description: "Rust web framework",
    service: {
      name: "Rust API",
      cwd: ".",
      command: "cargo run",
      shell: "bash",
      env: { RUST_LOG: "info" },
      autoStart: false,
      dependsOn: [],
    },
    healthProbe: { type: "log", pattern: "listening" },
    tags: ["rust", "api", "compiled"],
  },
  {
    id: "go-fiber",
    name: "Go (Fiber)",
    icon: "🐹",
    category: "backend",
    description: "Go web framework",
    service: {
      name: "Go API",
      cwd: ".",
      command: "go run main.go",
      shell: "bash",
      env: {},
      autoStart: false,
      dependsOn: [],
    },
    healthProbe: { type: "log", pattern: "listening" },
    tags: ["go", "api", "compiled"],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    icon: "🐘",
    category: "database",
    description: "PostgreSQL via Docker Compose",
    service: {
      name: "PostgreSQL",
      cwd: ".",
      command: "docker compose up postgres",
      shell: "bash",
      env: { POSTGRES_PORT: "5432", POSTGRES_DB: "dev", POSTGRES_PASSWORD: "dev" },
      autoStart: true,
      dependsOn: [],
    },
    healthProbe: { type: "log", pattern: "database system is ready" },
    tags: ["database", "sql", "docker"],
  },
  {
    id: "redis",
    name: "Redis",
    icon: "📦",
    category: "database",
    description: "In-memory key-value store",
    service: {
      name: "Redis",
      cwd: ".",
      command: "docker compose up redis",
      shell: "bash",
      env: { REDIS_PORT: "6379" },
      autoStart: true,
      dependsOn: [],
    },
    healthProbe: { type: "log", pattern: "Ready to accept" },
    tags: ["database", "cache", "docker"],
  },
  {
    id: "mysql",
    name: "MySQL",
    icon: "🐬",
    category: "database",
    description: "MySQL via Docker Compose",
    service: {
      name: "MySQL",
      cwd: ".",
      command: "docker compose up mysql",
      shell: "bash",
      env: { MYSQL_PORT: "3306", MYSQL_ROOT_PASSWORD: "root", MYSQL_DATABASE: "dev" },
      autoStart: true,
      dependsOn: [],
    },
    healthProbe: { type: "log", pattern: "ready for connections" },
    tags: ["database", "sql", "docker"],
  },
  {
    id: "flutter",
    name: "Flutter",
    icon: "🦋",
    category: "mobile",
    description: "Cross-platform mobile dev",
    service: {
      name: "Flutter App",
      cwd: ".",
      command: "flutter run",
      shell: "bash",
      env: {},
      autoStart: false,
      dependsOn: [],
    },
    healthProbe: { type: "none" },
    tags: ["mobile", "dart", "cross-platform"],
  },
  {
    id: "worker",
    name: "Background Worker",
    icon: "⚙️",
    category: "worker",
    description: "Generic queue/job worker",
    service: {
      name: "Queue Worker",
      cwd: ".",
      command: "npm run worker",
      shell: "bash",
      env: {},
      autoStart: false,
      dependsOn: [],
    },
    healthProbe: { type: "log", pattern: "worker started" },
    tags: ["worker", "queue", "jobs"],
  },
];

const CATEGORIES: { id: TemplateDef["category"]; label: string }[] = [
  { id: "frontend", label: "Frontend" },
  { id: "backend", label: "Backend" },
  { id: "database", label: "Database" },
  { id: "worker", label: "Worker" },
  { id: "mobile", label: "Mobile" },
];

interface ServiceTemplatesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function ServiceTemplates({ open, onOpenChange, projectId }: ServiceTemplatesProps) {
  const { addService } = useMiror();
  const [category, setCategory] = useState<TemplateDef["category"] | "all">("all");

  const filtered = category === "all"
    ? TEMPLATES
    : TEMPLATES.filter(t => t.category === category);

  const handleAdd = async (template: TemplateDef) => {
    await addService({
      projectId,
      ...template.service,
      healthProbe: template.healthProbe as any,
    } as Omit<Service, "id" | "status">);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookTemplate className="h-4 w-4" />
            Service Templates
          </DialogTitle>
        </DialogHeader>

        {/* Category filter */}
        <div className="flex items-center gap-1 border-b border-border pb-2">
          <button
            onClick={() => setCategory("all")}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs",
              category === "all"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/50"
            )}
          >
            All ({TEMPLATES.length})
          </button>
          {CATEGORIES.map(c => {
            const count = TEMPLATES.filter(t => t.category === c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  category === c.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                )}
              >
                {c.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Template grid */}
        <div className="flex-1 overflow-y-auto miror-scroll grid grid-cols-1 sm:grid-cols-2 gap-2 p-1">
          {filtered.map(template => (
            <div
              key={template.id}
              className="group rounded-md border border-border p-3 hover:border-primary/40 hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => handleAdd(template)}
            >
              <div className="flex items-start gap-2">
                <span className="text-xl">{template.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{template.name}</span>
                    {template.service.autoStart && (
                      <Badge variant="outline" className="text-status-running border-status-running/30 text-[9px] h-3.5 px-1">
                        auto-start
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{template.description}</p>
                  <div className="font-mono text-[10px] text-muted-foreground/70 mt-1.5 truncate">
                    $ {template.service.command}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {template.tags.map(tag => (
                      <span key={tag} className="text-[9px] text-muted-foreground/60 bg-muted/50 rounded px-1">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="text-[10px] text-muted-foreground">
          Click a template to add it. You can customize the command, env, and health probe after adding.
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
