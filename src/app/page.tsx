import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/session";

export default async function HomePage() {
  const user = await requireUser();
  redirect(user.role === "ADMIN" ? "/admin" : "/pos");
}
