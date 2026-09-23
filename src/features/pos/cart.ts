import type { CartLine, PosProduct } from "@/features/pos/types";
import { incrementIntegerQuantity } from "@/features/pos/money";

export function addProduct(cart: CartLine[], product: PosProduct): CartLine[] {
  const existing = cart.find((line) => line.id === product.id);
  if (!existing) {
    return [...cart, { ...product, quantity: product.unit_type === "UNIT" ? "1" : "" }];
  }

  if (product.unit_type === "UNIT") {
    return cart.map((line) =>
      line.id === product.id
        ? { ...line, quantity: incrementIntegerQuantity(line.quantity) }
        : line,
    );
  }

  return cart;
}

export function updateQuantity(cart: CartLine[], productId: string, quantity: string): CartLine[] {
  return cart.map((line) =>
    line.id === productId ? { ...line, quantity } : line,
  );
}

export function removeProduct(cart: CartLine[], productId: string): CartLine[] {
  return cart.filter((line) => line.id !== productId);
}
