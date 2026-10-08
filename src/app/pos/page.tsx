import { requireUser } from "@/features/auth/session";
import { getCurrentCashSessionState } from "@/features/cash/actions";
import { PosScreen } from "@/app/pos/pos-screen";

export default async function PosPage() {
  const user = await requireUser();
  let cashSessionOpen = false;
  let cashSessionId: string | null = null;
  let cashSessionError: string | null = null;
  try {
    const state = await getCurrentCashSessionState();
    cashSessionOpen = state.kind === "OPEN";
    cashSessionId = state.kind === "OPEN" ? state.session.session_id : null;
  } catch {
    console.error("POS cash session load failed");
    cashSessionError = "No se pudo verificar el estado de la caja. No se pueden realizar ventas.";
  }

  return <PosScreen userId={user.userId} userRole={user.role} sellerName={user.displayName ?? user.email} initialCashSessionOpen={cashSessionOpen} initialCashSessionId={cashSessionId} initialCashSessionError={cashSessionError} />;
}
