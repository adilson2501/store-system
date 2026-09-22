import { redirect } from "next/navigation";
import { getSession } from "@/features/auth/session";
import { LoginForm } from "@/app/login/login-form";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-zinc-900">
            Store System
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Sign in to continue</p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
