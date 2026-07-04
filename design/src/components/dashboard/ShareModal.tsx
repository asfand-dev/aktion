"use client";
/**
 * Share-management dialog for a project: lists the owner + collaborators,
 * lets the owner invite people by email (edit/view), change a collaborator's
 * role and remove them.
 */
import { useEffect, useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { Button, Menu, Modal, Spinner, TextInput, toast } from "@/components/ui";
import { api } from "@/lib/api";
import type { ProjectSummary, ShareInfo } from "@/design/types";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

function Avatar({ name }: { name: string }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ background: `hsl(${hue} 45% 42%)` }}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function PersonRow({
  name,
  email,
  right,
}: {
  name: string;
  email: string;
  right: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 px-1 py-2">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-text-1">{name}</div>
        <div className="truncate text-xs text-text-3">{email}</div>
      </div>
      {right}
    </div>
  );
}

export default function ShareModal({
  project,
  open,
  onClose,
}: {
  project: ProjectSummary;
  open: boolean;
  onClose: () => void;
}) {
  const [shares, setShares] = useState<ShareInfo[] | null>(null);
  const [email, setEmail] = useState("");
  const [canEdit, setCanEdit] = useState(true);
  const [adding, setAdding] = useState(false);
  const isOwner = project.role === "owner";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setShares(null);
    api
      .get<{ shares: ShareInfo[] }>(`/api/projects/${project.id}/shares`)
      .then((res) => {
        if (!cancelled) setShares(res.shares);
      })
      .catch((err) => {
        if (cancelled) return;
        toast(errorMessage(err), "error");
        setShares([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, project.id]);

  async function addCollaborator(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      const res = await api.post<{ share: ShareInfo }>(
        `/api/projects/${project.id}/shares`,
        { email: trimmed, canEdit },
      );
      setShares((prev) => {
        const rest = (prev ?? []).filter((s) => s.user.id !== res.share.user.id);
        return [...rest, res.share];
      });
      setEmail("");
      toast(`Shared with ${res.share.user.name}`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setAdding(false);
    }
  }

  async function toggleCanEdit(share: ShareInfo) {
    try {
      const res = await api.patch<{ share: ShareInfo }>(
        `/api/projects/${project.id}/shares/${share.id}`,
        { canEdit: !share.canEdit },
      );
      setShares((prev) =>
        (prev ?? []).map((s) => (s.id === share.id ? res.share : s)),
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function removeShare(share: ShareInfo) {
    try {
      await api.del<{ ok: true }>(`/api/projects/${project.id}/shares/${share.id}`);
      setShares((prev) => (prev ?? []).filter((s) => s.id !== share.id));
      toast(`Removed ${share.user.name}`, "info");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Share "${project.name}"`} width={460}>
      {isOwner && (
        <form onSubmit={addCollaborator} className="mb-3 flex items-center gap-2">
          <TextInput
            type="email"
            placeholder="Invite by email…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
            autoFocus
          />
          <select
            value={canEdit ? "edit" : "view"}
            onChange={(e) => setCanEdit(e.target.value === "edit")}
            aria-label="Permission"
            className="h-8 shrink-0 rounded-md border border-border-1 bg-bg-2 px-2 text-[13px] text-text-1 focus:border-accent focus:outline-none"
          >
            <option value="edit">Can edit</option>
            <option value="view">Can view</option>
          </select>
          <Button
            type="submit"
            variant="primary"
            loading={adding}
            disabled={!email.trim()}
          >
            <UserPlus size={13} />
            Add
          </Button>
        </form>
      )}

      <div className="divide-y divide-border-0 rounded-lg border border-border-0 bg-bg-0/40 px-2">
        {/* Owner row, pinned at the top. */}
        <PersonRow
          name={project.owner.name}
          email={project.owner.email}
          right={
            <span className="rounded bg-bg-3 px-1.5 py-0.5 text-[11px] font-medium text-text-2">
              Owner
            </span>
          }
        />

        {shares === null ? (
          <div className="flex items-center justify-center py-6">
            <Spinner />
          </div>
        ) : shares.length === 0 ? (
          <div className="px-1 py-4 text-center text-xs text-text-3">
            Not shared with anyone yet.
          </div>
        ) : (
          shares.map((share) => (
            <PersonRow
              key={share.id}
              name={share.user.name}
              email={share.user.email}
              right={
                isOwner ? (
                  <Menu
                    align="end"
                    trigger={
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-2 hover:bg-bg-3 hover:text-text-1"
                      >
                        {share.canEdit ? "Can edit" : "Can view"}
                        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
                          <path d="M1 2.5 4 5.5 7 2.5" stroke="currentColor" fill="none" />
                        </svg>
                      </button>
                    }
                    items={[
                      {
                        label: share.canEdit ? "Change to can view" : "Change to can edit",
                        onClick: () => toggleCanEdit(share),
                      },
                      "separator",
                      {
                        label: "Remove",
                        danger: true,
                        onClick: () => removeShare(share),
                      },
                    ]}
                  />
                ) : (
                  <span className="rounded bg-bg-3 px-1.5 py-0.5 text-[11px] text-text-2">
                    {share.canEdit ? "Can edit" : "Can view"}
                  </span>
                )
              }
            />
          ))
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
