import {
  BarChart3,
  Boxes,
  CreditCard,
  FileText,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

export type AdminNavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type AdminNavigationGroup = {
  label: string;
  items: AdminNavigationItem[];
};

export const adminNavigationGroups: AdminNavigationGroup[] = [
  {
    label: "General",
    items: [{ href: "/admin", label: "Inicio", icon: LayoutDashboard }],
  },
  {
    label: "Inventario",
    items: [
      { href: "/admin/products", label: "Productos", icon: Package },
      { href: "/admin/categories", label: "Categorías", icon: Tags },
      { href: "/admin/suppliers", label: "Proveedores", icon: Truck },
      { href: "/admin/purchases", label: "Compras", icon: Boxes },
    ],
  },
  {
    label: "Ventas y control",
    items: [
      { href: "/admin/sales", label: "Ventas", icon: ShoppingCart },
      { href: "/admin/cash-sessions", label: "Cajas", icon: WalletCards },
      { href: "/admin/reports", label: "Reportes", icon: BarChart3 },
    ],
  },
  {
    label: "Administración",
    items: [
      { href: "/admin/users", label: "Usuarios", icon: Users },
      { href: "/admin/customers", label: "Clientes", icon: CreditCard },
    ],
  },
];

export const operationalNavigation: AdminNavigationItem[] = [
  { href: "/pos", label: "POS operativo", icon: Store },
  { href: "/cash", label: "Caja operativa", icon: WalletCards },
  { href: "/customers", label: "Clientes", icon: FileText },
];

export function isAdminNavigationItemActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
