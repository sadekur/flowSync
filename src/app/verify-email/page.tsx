import { VerifyEmailForm } from "@/components/auth/VerifyEmailForm";

// Reached from the verification email. As with /reset-password, the token is
// in the URL fragment, so there's nothing to fetch server-side and no login
// is needed: the link may be opened on another device.
export default function VerifyEmailPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Confirm your email</h1>
      <VerifyEmailForm />
    </div>
  );
}
