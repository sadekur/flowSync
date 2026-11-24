# Workspace invites

**Implemented.** An owner invites by email with `POST /api/workspaces/:workspaceId/members` (see `docs/api/workspaces.md`), which also lists and cancels invites. The routes here are for the person who got the email.

The email links to `{APP_URL}/invite#token=<token>`. The token sits in the URL **fragment**, which browsers never send to a server. Only its sha256 is stored (`WorkspaceInvite`, one per workspace + email, deleted by a TTL index after it expires). An invite lasts **7 days** and works once.

Accepting needs **both** the token and a session for an account whose email is the invited one. Holding a forwarded or leaked link isn't enough. Since the token can only have come from that inbox, accepting also sets the account's `emailVerifiedAt`.

## `POST /api/invites/lookup`

Body: `{ "token": string }`. No auth, no CSRF: it only reads, and the person may not have an account yet. POST rather than GET keeps the token out of URLs and logs.

- **200** `{ "invite": { "email", "workspaceName", "invitedByName", "expiresAt" } }`. Changes nothing, so a mail scanner opening the link is harmless.
- **400** made-up, used, cancelled or expired token, or missing token

## `POST /api/invites/accept`

Body: `{ "token": string }`. Requires auth + `X-CSRF-Token`.

- **200** `{ "workspace": { "_id", "name", "slug" } }`. The caller is now a member (if they already were, nothing changes), their email is verified, and the invite is used up. The redeem is an atomic `findOneAndDelete`, so racing requests can't both succeed. Membership caches are invalidated as for any add.
- **403** the session's account isn't the invited email: `"This invite is for <email>. Log in with that account to accept it."`. The invite stays usable.
- **400** invalid, used, cancelled or expired token, or the workspace was deleted
- **401** no session · **403** missing/invalid CSRF

A brand-new person signs up and accepts in one step by sending `inviteToken` to `POST /api/auth/register` (see `docs/api/auth.md`).
