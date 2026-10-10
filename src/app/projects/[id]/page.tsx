import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { serverFetch } from "@/lib/server-fetch";
import { AppHeader } from "@/components/layout/AppHeader";
import { StoreHydrator } from "@/store/StoreHydrator";
import { CreateTaskForm } from "@/components/tasks/CreateTaskForm";
import { TaskList } from "@/components/tasks/TaskList";
import { ProjectLiveStatus } from "@/components/projects/ProjectLiveStatus";
import { PresenceList } from "@/components/projects/PresenceList";
import { ChatPanel } from "@/components/chat/ChatPanel";
import type { MessagePage, Project, Task, User, Workspace } from "@/types/api";

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: projectId } = await params;
  const { workspace: workspaceId } = await searchParams;

  if (typeof workspaceId !== "string") {
    notFound();
  }

  const [projectRes, tasksRes, workspaceRes, messagesRes] = await Promise.all([
    serverFetch(`/api/workspaces/${workspaceId}/projects/${projectId}`),
    serverFetch(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`),
    serverFetch(`/api/workspaces/${workspaceId}`),
    serverFetch(`/api/workspaces/${workspaceId}/projects/${projectId}/messages`),
  ]);

  if (!projectRes.ok || !workspaceRes.ok) {
    notFound();
  }

  const { project } = (await projectRes.json()) as { project: Project };
  const { tasks } = tasksRes.ok ? ((await tasksRes.json()) as { tasks: Task[] }) : { tasks: [] };
  const { workspace } = (await workspaceRes.json()) as { workspace: Workspace };
  const messagePage: MessagePage = messagesRes.ok
    ? ((await messagesRes.json()) as MessagePage)
    : { messages: [], hasMore: false };

  // GET /api/workspaces/:id returns members populated with name/email
  // (see workspace.controller.ts) — filter out the theoretical string case
  // defensively since the shared `Workspace` type also covers unpopulated use.
  const members = workspace.members.filter((m): m is User => typeof m !== "string");

  return (
    <div className="flex flex-1 flex-col">
      <StoreHydrator user={user} />
      <AppHeader user={user} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
        <div>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-xl font-semibold">{project.name}</h1>
            {/* Canonical _id, not the URL slug — the socket room is keyed by id. */}
            <ProjectLiveStatus projectId={project._id} />
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{project.description}</p>
          )}
        </div>

        <PresenceList projectId={project._id} members={members} currentUserId={user._id} />

        {/* Canonical _id, not the URL slug — the store and socket events are
            keyed by id (see DECISIONS.md), matching ProjectLiveStatus below. */}
        <CreateTaskForm workspaceId={workspaceId} projectId={project._id} members={members} />

        <TaskList workspaceId={workspaceId} projectId={project._id} initialTasks={tasks} />

        <ChatPanel
          workspaceId={workspaceId}
          projectId={project._id}
          currentUserId={user._id}
          members={members}
          initialMessages={messagePage.messages}
          initialHasOlder={messagePage.hasMore}
        />
      </main>
    </div>
  );
}
