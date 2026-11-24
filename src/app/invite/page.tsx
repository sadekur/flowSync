import { getCurrentUser } from "@/lib/session";
import { InviteAcceptance } from "@/components/invites/InviteAcceptance";

// Reached from a workspace invite email. The token is in the URL fragment,
// so the server can't see it; it only tells the page who (if anyone) is
// logged in, which decides between "Join" and "create an account / log in".
export default async function InvitePage() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">You&apos;re invited</h1>
      <InviteAcceptance user={user} />
    </div>
  );
}
