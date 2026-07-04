"use client";
/**
 * A single project tile on the dashboard grid: thumbnail (or placeholder),
 * name, last-edited time, role/share badges and a hover action menu
 * (open, preview, rename, duplicate, share, delete).
 */
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Users } from "lucide-react";
import { Button, Field, Menu, Modal, TextInput, toast } from "@/components/ui";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import type { ProjectSummary } from "@/design/types";
import ShareModal from "./ShareModal";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

type MenuItems = Parameters<typeof Menu>[0]["items"];

export default function ProjectCard({
  project,
  onUpdated,
  onDeleted,
  onDuplicated,
}: {
  project: ProjectSummary;
  onUpdated: (project: ProjectSummary) => void;
  onDeleted: (id: string) => void;
  onDuplicated: (project: ProjectSummary) => void;
}) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState(project.name);
  const [renaming, setRenaming] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const isOwner = project.role === "owner";
  const canEdit = project.role !== "viewer";
  const initial = (project.name.trim()[0] ?? "?").toUpperCase();

  function openEditor() {
    router.push(`/editor/${project.id}`);
  }

  async function submitRename(e: FormEvent) {
    e.preventDefault();
    const name = renameName.trim();
    if (!name || name === project.name) {
      setRenameOpen(false);
      return;
    }
    setRenaming(true);
    try {
      const res = await api.patch<{ project: ProjectSummary }>(
        `/api/projects/${project.id}`,
        { name },
      );
      onUpdated(res.project);
      setRenameOpen(false);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setRenaming(false);
    }
  }

  async function duplicate() {
    try {
      const res = await api.post<{ project: ProjectSummary }>("/api/projects", {
        name: `${project.name} copy`,
        duplicateOf: project.id,
      });
      onDuplicated(res.project);
      toast("Project duplicated", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await api.del<{ ok: true }>(`/api/projects/${project.id}`);
      setDeleteOpen(false);
      onDeleted(project.id);
      toast("Project deleted", "info");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setDeleting(false);
    }
  }

  const menuItems: MenuItems = [
    { label: "Open", onClick: openEditor },
    {
      label: "Open preview",
      onClick: () => window.open(`/preview/${project.id}`, "_blank"),
    },
    "separator",
    ...(canEdit
      ? [
          {
            label: "Rename…",
            onClick: () => {
              setRenameName(project.name);
              setRenameOpen(true);
            },
          },
        ]
      : []),
    { label: "Duplicate", onClick: duplicate },
    {
      label: "Export JSON",
      onClick: () => {
        toast("Preparing export…", "info");
        void import("@/lib/project-transfer").then(({ exportProjectJson }) =>
          exportProjectJson(project.id).catch((err) => toast(errorMessage(err), "error")),
        );
      },
    },
    ...(isOwner ? [{ label: "Share…", onClick: () => setShareOpen(true) }] : []),
    ...(isOwner
      ? ([
          "separator",
          { label: "Delete…", danger: true, onClick: () => setDeleteOpen(true) },
        ] as MenuItems)
      : []),
  ];

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${project.name}`}
        onClick={openEditor}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target === e.currentTarget) openEditor();
        }}
        className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border-0 bg-bg-1 transition-colors hover:border-border-1"
      >
        {/* Thumbnail */}
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-bg-2">
          {project.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URL thumbnail
            <img
              src={project.thumbnail}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              aria-hidden
              className="flex h-full w-full items-center justify-center"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)," +
                  "linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)," +
                  "radial-gradient(ellipse at 20% 0%, rgba(13,153,255,0.12), transparent 65%)",
                backgroundSize: "22px 22px, 22px 22px, 100% 100%",
              }}
            >
              <span className="select-none text-4xl font-semibold text-text-3/50">
                {initial}
              </span>
            </div>
          )}
        </div>

        {/* Meta row */}
        <div className="flex flex-1 items-start justify-between gap-2 border-t border-border-0 px-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-text-1">
              {project.name}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-text-3">
              <span>Edited {timeAgo(project.updatedAt)}</span>
              {!isOwner && (
                <span className="rounded bg-bg-3 px-1.5 py-px font-medium text-text-2">
                  {project.role === "editor" ? "can edit" : "view only"}
                </span>
              )}
              {project.shareCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-bg-3 px-1.5 py-px text-text-2">
                  <Users size={10} />
                  {project.shareCount}
                </span>
              )}
            </div>
          </div>

          <div
            className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <Menu
              align="end"
              trigger={
                <button
                  type="button"
                  aria-label={`Actions for ${project.name}`}
                  className="rounded-md p-1 text-text-3 hover:bg-bg-3 hover:text-text-1"
                >
                  <MoreHorizontal size={16} />
                </button>
              }
              items={menuItems}
            />
          </div>
        </div>
      </div>

      {/* Rename */}
      <Modal open={renameOpen} onClose={() => setRenameOpen(false)} title="Rename project">
        <form onSubmit={submitRename} className="space-y-4">
          <Field label="Name">
            <TextInput
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              autoFocus
              onFocus={(e) => e.target.select()}
              placeholder="Project name"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={renaming}
              disabled={!renameName.trim()}
            >
              Rename
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete project">
        <p className="text-[13px] text-text-2">
          Delete <span className="font-medium text-text-1">“{project.name}”</span>?
          This permanently removes the project and its assets for everyone it is
          shared with. This can’t be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="danger" loading={deleting} onClick={confirmDelete}>
            Delete
          </Button>
        </div>
      </Modal>

      {/* Share */}
      {isOwner && (
        <ShareModal
          project={project}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}
    </>
  );
}
