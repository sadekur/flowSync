"use client";

import { useAppSelector } from "@/store/hooks";
import type { User } from "@/types/api";

// Shows which workspace members currently have this project open. Backed by
// Redis presence (per project room): the join ack seeds the snapshot, then
// user:online / user:offline keep it live.
export function PresenceList({
  projectId,
  members,
  currentUserId,
}: {
  projectId: string;
  members: User[];
  currentUserId: string;
}) {
  const onlineUserIds = useAppSelector((s) => s.presence.onlineUserIds);
  const joined = useAppSelector((s) => s.socket.joinedProjectId === projectId);

  // Before the room is confirmed there is nothing truthful to show.
  if (!joined) return null;

  const onlineOthers = members.filter((member) => member._id !== currentUserId && onlineUserIds.includes(member._id));

  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-lg font-semibold">Online now</h2>
      {onlineOthers.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No one else is viewing this project right now.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {onlineOthers.map((member) => (
            <li key={member._id} className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {member.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
