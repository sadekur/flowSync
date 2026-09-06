import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import type { User } from "@/types/api";

export function AppHeader({ user }: { user: User }) {
  return (
    <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
      <Link href="/dashboard" className="font-semibold">
        FlowSync
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">{user.name}</span>
        <LogoutButton />
      </div>
    </header>
  );
}
