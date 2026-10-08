import { OperationalHeader } from "@/app/pos/operational-header";
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
    <main className="min-h-screen bg-background text-foreground">
      <OperationalHeader
        sellerName={user.displayName ?? user.email}
        userRole={user.role}
        cashSessionOpen={initialState.kind === "OPEN"}
      />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-5 sm:py-8">
        <div className="mb-6">
          <p className="text-sm font-semibold text-primary">Ventas y control</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">Caja</h1>
          <p className="mt-1 text-sm text-muted-foreground">Apertura, efectivo disponible y cierre del turno</p>
        </div>
        <CashScreen initialState={initialState} initialError={initialError} />
      </div>
    </main>
  );
}
