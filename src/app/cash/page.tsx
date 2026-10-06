import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/features/auth/session";
import { getCurrentCashSessionState } from "@/features/cash/actions";
import type { CashSessionState } from "@/features/cash/types";
import { CashScreen } from "./cash-screen";

export default async function CashPage() {
  const user = await requireUser();
  let initialState: CashSessionState = { kind: "NONE" };
  let initialError = "";
  try {
    initialState = await getCurrentCashSessionState();
  } catch (error) {
    console.error(error);
    initialError = "No se pudo cargar la caja. Intenta actualizar nuevamente.";
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Caja</h1>
          <p className="mt-1 text-sm text-zinc-500">Apertura y cierre de la caja del día</p>
        </div>
        <CashScreen initialState={initialState} initialError={initialError} />
      </main>
    </div>
  );
}
