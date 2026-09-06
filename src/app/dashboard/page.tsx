import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { serverFetch } from "@/lib/server-fetch";
import { AppHeader } from "@/components/layout/AppHeader";
import { StoreHydrator } from "@/store/StoreHydrator";
import { CreateWorkspaceForm } from "@/components/workspaces/CreateWorkspaceForm";
import { CreateProjectForm } from "@/components/workspaces/CreateProjectForm";
import type { Project, Workspace } from "@/types/api";

type WorkspaceWithProjects = Workspace & { projects: Project[] };

async function getWorkspacesWithProjects(): Promise<WorkspaceWithProjects[]> {
  const res = await serverFetch("/api/workspaces");
  if (!res.ok) return [];

  const { workspaces } = (await res.json()) as { workspaces: Workspace[] };

  return Promise.all(
    workspaces.map(async (workspace): Promise<WorkspaceWithProjects> => {
      const projectsRes = await serverFetch(`/api/workspaces/${workspace._id}/projects`);
      const { projects } = projectsRes.ok
        ? ((await projectsRes.json()) as { projects: Project[] })
        : { projects: [] };
      return { ...workspace, projects };
    }),
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces = await getWorkspacesWithProjects();

  return (
    <div className="flex flex-1 flex-col">
      <StoreHydrator user={user} />
      <AppHeader user={user} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold">Your workspaces</h1>
          <CreateWorkspaceForm />
        </section>

        <section className="flex flex-col gap-6">
          {workspaces.length === 0 && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No workspaces yet — create one above to get started.
            </p>
          )}

          {workspaces.map((workspace) => (
            <div
              key={workspace._id}
              className="rounded-lg border border-black/10 p-5 dark:border-white/10"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-medium">{workspace.name}</h2>
                <span className="text-xs text-zinc-500">
                  {workspace.members.length} member(s)
                </span>
              </div>

              <ul className="mt-4 flex flex-col gap-2">
                {workspace.projects.map((project) => (
                  <li key={project._id}>
                    <Link
                      href={`/projects/${project.slug}?workspace=${workspace.slug}`}
                      className="text-sm font-medium underline underline-offset-2"
                    >
                      {project.name}
                    </Link>
                  </li>
                ))}
                {workspace.projects.length === 0 && (
                  <li className="text-sm text-zinc-500">No projects yet.</li>
                )}
              </ul>

              <div className="mt-4">
                <CreateProjectForm workspaceId={workspace._id} />
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
