import { db } from "./db";

export type ProjectRole = "owner" | "editor" | "viewer";

export interface ProjectAccess {
  role: ProjectRole;
  project: {
    id: string;
    name: string;
    ownerId: string;
    thumbnail: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * Resolve a user's access to a project: owners get "owner", shared users get
 * "editor" or "viewer" depending on the share's canEdit flag, everyone else
 * gets null (respond 404 — do not leak existence).
 */
export async function getProjectAccess(
  projectId: string,
  userId: string,
): Promise<ProjectAccess | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      thumbnail: true,
      createdAt: true,
      updatedAt: true,
      shares: { where: { userId }, select: { canEdit: true } },
    },
  });
  if (!project) return null;
  const { shares, ...rest } = project;
  if (project.ownerId === userId) return { role: "owner", project: rest };
  const share = shares[0];
  if (!share) return null;
  return { role: share.canEdit ? "editor" : "viewer", project: rest };
}

export function canEdit(role: ProjectRole): boolean {
  return role === "owner" || role === "editor";
}
