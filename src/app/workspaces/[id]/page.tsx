import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { serverFetch } from "@/lib/server-fetch";
import { AppHeader } from "@/components/layout/AppHeader";
import { StoreHydrator } from "@/store/StoreHydrator";
import { WorkspaceMembers, type MemberSummary } from "@/components/workspaces/WorkspaceMembers";
import type { WorkspaceInvite } from "@/types/api";

// GET /api/workspaces/:id populates owner and members.
interface PopulatedWorkspace {
  _id: string;
  name: string;
  owner: MemberSummary;
  members: MemberSummary[];
}

export default async function WorkspaceMembersPage({ params }: PageProps<"/workspaces/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const workspaceRes = await serverFetch(`/api/workspaces/${encodeURIComponent(id)}`);
  // 403 (not a member) looks the same as 404, as on the API.
  if (!workspaceRes.ok) notFound();
  const { workspace } = (await workspaceRes.json()) as { workspace: PopulatedWorkspace };

  const isOwner = workspace.owner._id === user._id;
  let invites: WorkspaceInvite[] = [];
  if (isOwner) {
    const invitesRes = await serverFetch(`/api/workspaces/${workspace._id}/invites`);
    if (invitesRes.ok) ({ invites } = (await invitesRes.json()) as { invites: WorkspaceInvite[] });
  }

  return (
    <div className="flex flex-1 flex-col">
      <StoreHydrator user={user} />
      <AppHeader user={user} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-1">
          <Link href="/dashboard" className="text-sm text-zinc-600 underline underline-offset-2 dark:text-zinc-400">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-semibold">{workspace.name}</h1>
        </div>
        <WorkspaceMembers
          workspaceId={workspace._id}
          ownerId={workspace.owner._id}
          isOwner={isOwner}
          members={workspace.members}
          invites={invites}
        />
      </main>
    </div>
  );
}
