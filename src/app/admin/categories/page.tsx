import Link from "next/link";
import { ArrowLeft, FolderPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/features/auth/session";
import { listCategories } from "@/features/catalog/products/queries";
import {
  CategoryCreateForm,
  CategoryRow,
} from "@/app/admin/categories/category-forms";

export default async function CategoriesPage() {
  await requireAdmin();
  const categories = await listCategories();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Inventario</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Categorías</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Organiza tu catálogo con etiquetas simples y fáciles de mantener.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {categories.length} {categories.length === 1 ? "categoría" : "categorías"} registradas
          </p>
        </div>
        <Link href="/admin/products" className={cn(buttonVariants({ variant: "outline" }), "sm:mt-6")}>
          <ArrowLeft aria-hidden="true" />
          Volver a productos
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderPlus aria-hidden="true" className="size-4 text-primary" />
            Nueva categoría
          </CardTitle>
          <CardDescription>Agrega una categoría para organizar tus productos.</CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryCreateForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="text-base">Categorías registradas</CardTitle>
          <CardDescription>Actualiza el nombre o disponibilidad de cada categoría.</CardDescription>
        </CardHeader>
        {categories.length === 0 ? (
          <CardContent className="py-10 text-center">
            <Badge variant="secondary">Catálogo sin categorías</Badge>
            <p className="mt-3 text-sm text-muted-foreground">Crea la primera categoría para comenzar a organizar productos.</p>
          </CardContent>
        ) : (
          <div className="divide-y divide-border">
            {categories.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
