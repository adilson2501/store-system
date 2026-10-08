import { OperationalHeader } from "@/app/pos/operational-header";
import { getCurrentCashSessionState } from "@/features/cash/actions";
import { requireUser } from "@/features/auth/session";
import { CustomerCollection } from "./customer-collection";

export default async function CustomersPage() {
  const user = await requireUser();
  let cashSessionOpen: boolean | null = null;
  try {
    const state = await getCurrentCashSessionState();
    cashSessionOpen = state.kind === "OPEN";
  } catch (error) {
    console.error(error);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <OperationalHeader
        sellerName={user.displayName ?? user.email}
        userRole={user.role}
        cashSessionOpen={cashSessionOpen === true}
      />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-5 sm:py-8">
        <div className="mb-6">
          <p className="text-sm font-semibold text-primary">Ventas y control</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Consulta la deuda de un cliente y registra sus pagos.</p>
        </div>
        <CustomerCollection initialCashSessionOpen={cashSessionOpen} />
      </div>
    </main>
  );
}
