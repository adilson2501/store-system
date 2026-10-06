import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/features/auth/session";
import { CustomerCollection } from "./customer-collection";

export default async function CustomersPage() {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-500">Consulta de deuda y registro de pagos</p>
        </div>
        <CustomerCollection />
      </main>
    </div>
  );
}
