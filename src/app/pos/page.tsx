import { requireUser } from "@/features/auth/session";
import { getCurrentCashSessionState } from "@/features/cash/actions";
import { PosScreen } from "@/app/pos/pos-screen";

export default async function PosPage() {
  const user = await requireUser();
  let cashSessionOpen = false;
  try {
    cashSessionOpen = (await getCurrentCashSessionState()).kind === "OPEN";
  } catch (error) {
    console.error(error);
  }

  return <PosScreen sellerName={user.displayName ?? user.email} initialCashSessionOpen={cashSessionOpen} />;
}
