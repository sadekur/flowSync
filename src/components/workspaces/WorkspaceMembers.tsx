"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/client-api";
import type { WorkspaceInvite } from "@/types/api";

export interface MemberSummary {
  _id: string;
  name: string;
  email: string;
}

interface WorkspaceMembersProps {
  workspaceId: string;
  ownerId: string;
  isOwner: boolean;
  members: MemberSummary[];
  /** Pending invites; only fetched for the owner. */
  invites: WorkspaceInvite[];
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong";
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

export function WorkspaceMembers({ workspaceId, ownerId, isOwner, members, invites }: WorkspaceMembersProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<string>): Promise<boolean> {
    setError(null);
    setNotice(null);
    setBusy(key);
    try {
      setNotice(await action());
      router.refresh();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const address = email.trim();
    const ok = await run("add", async () => {
      // 200 = an existing, verified account was added; 201 = an invite was emailed.
      const result = await apiFetch<{ workspace?: unknown; invite?: WorkspaceInvite }>(
        `/api/workspaces/${workspaceId}/members`,
        { method: "POST", body: JSON.stringify({ email: address }) },
      );
      return result.invite
        ? `Invite emailed to ${result.invite.email}.`
        : `${address} was added and told by email.`;
    });
    if (ok) setEmail("");
  }

  const removeMember = (member: MemberSummary) =>
    run(`member:${member._id}`, async () => {
      await apiFetch(`/api/workspaces/${workspaceId}/members/${member._id}`, { method: "DELETE" });
      return `${member.name} was removed.`;
    });

  const cancelInvite = (invite: WorkspaceInvite) =>
    run(`invite:${invite._id}`, async () => {
      await apiFetch(`/api/workspaces/${workspaceId}/invites/${invite._id}`, { method: "DELETE" });
      return `The invite to ${invite.email} was cancelled.`;
    });

  const smallButton =
    "rounded-md border border-black/10 px-2.5 py-1 text-xs hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5";

  return (
    <div className="flex flex-col gap-8">
      {isOwner && (
        <form onSubmit={handleAdd} className="flex flex-col gap-2">
          <label htmlFor="invite-email" className="text-sm font-medium">
            Add someone by email
          </label>
          <div className="flex gap-2">
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="min-w-0 flex-1 rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
            />
            <button
              type="submit"
              disabled={busy === "add"}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {busy === "add" ? "Sending…" : "Add"}
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            People with a verified FlowSync account join at once. Anyone else gets an invite link by email.
          </p>
        </form>
      )}

      {notice && (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Members ({members.length})</h2>
        <ul className="flex flex-col divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
          {members.map((member) => (
            <li key={member._id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {member.name}
                  {member._id === ownerId && <span className="ml-2 text-xs font-normal text-zinc-500">Owner</span>}
                </p>
                <p className="truncate text-xs text-zinc-500">{member.email}</p>
              </div>
              {isOwner && member._id !== ownerId && (
                <button
                  type="button"
                  onClick={() => removeMember(member)}
                  disabled={busy === `member:${member._id}`}
                  aria-label={`Remove ${member.name}`}
                  className={smallButton}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isOwner && (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">Pending invites ({invites.length})</h2>
          {invites.length === 0 ? (
            <p className="text-sm text-zinc-500">No pending invites.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
              {invites.map((invite) => (
                <li key={invite._id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{invite.email}</p>
                    <p className="text-xs text-zinc-500">Expires {formatDate(invite.expiresAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => cancelInvite(invite)}
                    disabled={busy === `invite:${invite._id}`}
                    aria-label={`Cancel the invite to ${invite.email}`}
                    className={smallButton}
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
