import { getProjectWorkspaceId, type ProjectRef } from "../services/project.service";
import { getWorkspaceMemberIds } from "../services/workspace.service";

/**
 * The socket-side equivalent of loadProject + requireWorkspaceMember: the
 * project's ids, or null when it doesn't exist *or* the user isn't a member of
 * its workspace — callers answer both the same way so ids can't be probed.
 *
 * Runs on every message:send / typing:start, so both lookups are served from
 * the Redis cache (Step 11); the services invalidate them on member changes
 * and deletes.
 */
export async function findProjectForMember(projectId: string, userId: string): Promise<ProjectRef | null> {
  const workspaceId = await getProjectWorkspaceId(projectId);
  if (!workspaceId) return null;

  const members = await getWorkspaceMemberIds(workspaceId);
  return members?.includes(userId) ? { _id: projectId, workspace: workspaceId } : null;
}
