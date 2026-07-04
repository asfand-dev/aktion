"use client";
/**
 * The projects dashboard: top bar (brand, search, new-project, user menu) and
 * a responsive grid of project cards split into "Your projects" and
 * "Shared with you".
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Frame, LogOut, Plus, Search } from "lucide-react";
import { Button, Field, Modal, Spinner, TextInput, toast } from "@/components/ui";
import { api } from "@/lib/api";
import type { ProjectSummary, SessionUser } from "@/design/types";
import { BrandMark } from "@/components/auth/AuthShell";
import ProjectCard from "./ProjectCard";
import { TEMPLATES } from "@/design/templates";

/** Grid of starter templates shown in the New Project modal. */
function TemplatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={
            "flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors " +
            (value === t.id
              ? "border-accent bg-accent-muted"
              : "border-border-1 hover:border-border-1 hover:bg-bg-2")
          }
        >
          <span
            className="h-14 w-full rounded-md"
            style={{
              background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})`,
              opacity: 0.85,
            }}
          />
          <span className="text-xs font-medium text-text-1">{t.name}</span>
          <span className="line-clamp-2 text-[11px] leading-snug text-text-3">
            {t.description}
          </span>
        </button>
      ))}
    </div>
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

function UserMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  async function logout() {
    try {
      await api.post<{ ok: true }>("/api/auth/logout");
    } catch {
      // Even if the request fails, fall through to the login page.
    }
    window.location.href = "/login";
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold text-white transition-transform hover:scale-105"
        style={{
          background: "linear-gradient(135deg, var(--accent), #7b5cff)",
        }}
      >
        {(user.name.trim()[0] ?? "?").toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-60 rounded-lg border border-border-1 bg-bg-2 py-1 shadow-xl">
          <div className="border-b border-border-0 px-3 py-2.5">
            <div className="truncate text-[13px] font-medium text-text-1">
              {user.name}
            </div>
            <div className="truncate text-xs text-text-3">{user.email}</div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text-1 hover:bg-bg-3"
          >
            <LogOut size={14} className="text-text-3" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function DashboardView({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [template, setTemplate] = useState("blank");
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const importProject = async (file: File) => {
    setImporting(true);
    try {
      const { importProjectJson } = await import("@/lib/project-transfer");
      const project = await importProjectJson(file);
      toast(`Imported "${project.name}"`, "success");
      router.push(`/editor/${project.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Import failed", "error");
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ projects: ProjectSummary[] }>("/api/projects")
      .then((res) => {
        if (!cancelled) setProjects(res.projects);
      })
      .catch((err) => {
        if (cancelled) return;
        toast(errorMessage(err), "error");
        setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = projects ?? [];
    return q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all;
  }, [projects, query]);

  const own = filtered.filter((p) => p.role === "owner");
  const shared = filtered.filter((p) => p.role !== "owner");

  function updateProject(updated: ProjectSummary) {
    setProjects((prev) =>
      (prev ?? []).map((p) => (p.id === updated.id ? updated : p)),
    );
  }
  function removeProject(id: string) {
    setProjects((prev) => (prev ?? []).filter((p) => p.id !== id));
  }
  function addProject(created: ProjectSummary) {
    setProjects((prev) => [created, ...(prev ?? [])]);
  }

  async function createProject(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await api.post<{ project: ProjectSummary }>("/api/projects", {
        name,
      });
      // Apply the chosen starter template before opening the editor.
      if (template !== "blank") {
        const { TEMPLATES } = await import("@/design/templates");
        const chosen = TEMPLATES.find((t) => t.id === template);
        if (chosen) {
          await api.patch(`/api/projects/${res.project.id}`, {
            document: chosen.build(),
          });
        }
      }
      router.push(`/editor/${res.project.id}`);
    } catch (err) {
      toast(errorMessage(err), "error");
      setCreating(false);
    }
  }

  const loading = projects === null;
  const totalCount = projects?.length ?? 0;
  const noResults = !loading && totalCount > 0 && filtered.length === 0;
  const emptyAccount = !loading && totalCount === 0;

  return (
    <div className="min-h-screen bg-bg-0">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border-0 bg-bg-1/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
          <Link
            href="/projects"
            className="flex shrink-0 items-center gap-2 text-[14px] font-semibold tracking-tight text-text-1"
          >
            <BrandMark size={22} />
            <span className="hidden sm:inline">Aktion Design</span>
          </Link>

          <div className="relative ml-2 w-full max-w-xs">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              aria-label="Search projects"
              className="h-8 w-full rounded-md border border-border-1 bg-bg-2 pl-8 pr-2.5 text-[13px] text-text-1 placeholder:text-text-3 focus:border-accent focus:outline-none"
            />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <Button
              variant="secondary"
              loading={importing}
              onClick={() => importFileRef.current?.click()}
              title="Import a project exported as .aktion-project.json"
            >
              Import
            </Button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importProject(file);
              }}
            />
            <Button
              variant="primary"
              onClick={() => {
                setNewName("");
                setNewOpen(true);
              }}
            >
              <Plus size={14} />
              New project
            </Button>
            <UserMenu user={user} />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        {loading ? (
          <div className="flex h-[55vh] items-center justify-center">
            <Spinner size={26} />
          </div>
        ) : emptyAccount ? (
          <div className="mx-auto mt-14 max-w-md rounded-xl border border-dashed border-border-1 bg-bg-1/50 px-8 py-14 text-center">
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background:
                  "radial-gradient(ellipse at 30% 20%, rgba(13,153,255,0.25), rgba(123,92,255,0.12))",
              }}
            >
              <Frame size={24} className="text-accent" />
            </div>
            <h2 className="mt-5 text-[15px] font-semibold text-text-1">
              Design something great
            </h2>
            <p className="mx-auto mt-1.5 max-w-xs text-[13px] text-text-3">
              Projects you create and projects shared with you will show up
              here. Start with a blank canvas.
            </p>
            <Button
              variant="primary"
              className="mt-6"
              onClick={() => {
                setNewName("");
                setNewOpen(true);
              }}
            >
              <Plus size={14} />
              Create your first project
            </Button>
          </div>
        ) : noResults ? (
          <div className="mt-20 text-center text-[13px] text-text-3">
            No projects match{" "}
            <span className="text-text-1">“{query.trim()}”</span>.
          </div>
        ) : (
          <div className="space-y-10">
            {own.length > 0 && (
              <section>
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold text-text-1">
                    Your projects
                  </h2>
                  <span className="text-xs text-text-3">{own.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {own.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      onUpdated={updateProject}
                      onDeleted={removeProject}
                      onDuplicated={addProject}
                    />
                  ))}
                </div>
              </section>
            )}

            {shared.length > 0 && (
              <section>
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold text-text-1">
                    Shared with you
                  </h2>
                  <span className="text-xs text-text-3">{shared.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {shared.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      onUpdated={updateProject}
                      onDeleted={removeProject}
                      onDuplicated={addProject}
                    />
                  ))}
                </div>
              </section>
            )}

            {own.length === 0 && shared.length > 0 && query.trim() === "" && (
              <p className="text-center text-xs text-text-3">
                You don’t own any projects yet — create one to get started.
              </p>
            )}
          </div>
        )}
      </main>

      {/* New project */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New project" width={620}>
        <form onSubmit={createProject} className="space-y-4">
          <Field label="Name">
            <TextInput
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Untitled design"
              autoFocus
            />
          </Field>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-text-2">
              Start from
            </span>
            <TemplatePicker value={template} onChange={setTemplate} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={creating}
              disabled={!newName.trim()}
            >
              Create project
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
