import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

// Reached from the reset email. The token travels in the URL fragment
// (#token=…), which only the browser sees, so this page has nothing to fetch
// server-side; the form reads it on the client.
export default function ResetPasswordPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <ResetPasswordForm />
    </div>
  );
}
