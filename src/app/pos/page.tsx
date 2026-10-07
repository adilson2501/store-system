import { requireUser } from "@/features/auth/session";
import { getCurrentCashSessionState } from "@/features/cash/actions";
import { PosScreen } from "@/app/pos/pos-screen";

export default async function PosPage() {
  const user = await requireUser();
  let cashSessionOpen = false;
  let cashSessionId: string | null = null;
  try {
    const state = await getCurrentCashSessionState();
    cashSessionOpen = state.kind === "OPEN";
    cashSessionId = state.kind === "OPEN" ? state.session.session_id : null;
  } catch (error) {
    console.error(error);
  }

  return <PosScreen userId={user.userId} userRole={user.role} sellerName={user.displayName ?? user.email} initialCashSessionOpen={cashSessionOpen} initialCashSessionId={cashSessionId} />;
}
