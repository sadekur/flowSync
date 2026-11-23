import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <ForgotPasswordForm />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Remembered it?{" "}
        <Link href="/login" className="font-medium underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
