import { Project, type ProjectDocument } from "../models/Project";
import { Workspace } from "../models/Workspace";

/**
 * The socket-side equivalent of loadProject + requireWorkspaceMember: the
 * project, or null when it doesn't exist *or* the user isn't a member of its
 * workspace — callers answer both the same way so ids can't be probed.
 */
export async function findProjectForMember(projectId: string, userId: string): Promise<ProjectDocument | null> {
  const project = await Project.findById(projectId);
  if (!project) return null;

  const isMember = await Workspace.exists({ _id: project.workspace, members: userId });
  return isMember ? project : null;
}
