import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const { reset } = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Log in to FlowSync</h1>
      {reset === "1" && (
        <p role="status" className="max-w-sm rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
          Password updated. Log in with your new password.
        </p>
      )}
      <LoginForm />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        <Link href="/forgot-password" className="font-medium underline">
          Forgot your password?
        </Link>
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Need an account?{" "}
        <Link href="/register" className="font-medium underline">
          Register
        </Link>
      </p>
    </div>
  );
}
