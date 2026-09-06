import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { serverFetch } from "@/lib/server-fetch";
import { AppHeader } from "@/components/layout/AppHeader";
import { StoreHydrator } from "@/store/StoreHydrator";
import { CreateTaskForm } from "@/components/tasks/CreateTaskForm";
import { TaskStatusSelect } from "@/components/tasks/TaskStatusSelect";
import type { Project, Task, User, Workspace } from "@/types/api";

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: projectId } = await params;
  const { workspace: workspaceId } = await searchParams;

  if (typeof workspaceId !== "string") {
    notFound();
  }

  const [projectRes, tasksRes, workspaceRes] = await Promise.all([
    serverFetch(`/api/workspaces/${workspaceId}/projects/${projectId}`),
    serverFetch(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`),
    serverFetch(`/api/workspaces/${workspaceId}`),
  ]);

  if (!projectRes.ok || !workspaceRes.ok) {
    notFound();
  }

  const { project } = (await projectRes.json()) as { project: Project };
  const { tasks } = tasksRes.ok ? ((await tasksRes.json()) as { tasks: Task[] }) : { tasks: [] };
  const { workspace } = (await workspaceRes.json()) as { workspace: Workspace };

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
          <h1 className="text-xl font-semibold">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{project.description}</p>
          )}
        </div>

        <CreateTaskForm workspaceId={workspaceId} projectId={projectId} members={members} />

        <ul className="flex flex-col gap-3">
          {tasks.map((task) => (
            <li
              key={task._id}
              className="flex items-center justify-between gap-4 rounded-lg border border-black/10 px-4 py-3 dark:border-white/10"
            >
              <div>
                <p className="font-medium">{task.title}</p>
                {task.description && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{task.description}</p>
                )}
              </div>
              <TaskStatusSelect
                workspaceId={workspaceId}
                projectId={projectId}
                taskId={task._id}
                status={task.status}
              />
            </li>
          ))}
          {tasks.length === 0 && <li className="text-sm text-zinc-500">No tasks yet.</li>}
        </ul>
      </main>
    </div>
  );
}
