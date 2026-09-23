import { requireUser } from "@/features/auth/session";
import { PosScreen } from "@/app/pos/pos-screen";

export default async function PosPage() {
  const user = await requireUser();

  return <PosScreen sellerName={user.displayName ?? user.email} />;
}
