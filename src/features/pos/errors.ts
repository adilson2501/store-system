import type {
  ConfirmSaleResult,
  InsufficientStockItem,
  InsufficientStockMetadata,
} from "@/features/pos/types";
import { formatQuantity } from "@/features/catalog/products/validation";

const DEFINITIVE_ERROR_CODES: Array<{ match: string; code: string }> = [
  { match: "SALE_IDEMPOTENCY_CONFLICT", code: "SALE_IDEMPOTENCY_CONFLICT" },
  { match: "Insufficient stock for product", code: "INSUFFICIENT_STOCK" },
  { match: "Credit limit exceeded", code: "CREDIT_LIMIT_EXCEEDED" },
  { match: "Open cash session is required", code: "OPEN_CASH_SESSION_REQUIRED" },
  { match: "Product not found", code: "PRODUCT_NOT_FOUND" },
  { match: "Product is inactive or unavailable", code: "PRODUCT_UNAVAILABLE" },
  { match: "Customer not found", code: "CUSTOMER_NOT_FOUND" },
  { match: "Customer is inactive", code: "CUSTOMER_INACTIVE" },
  { match: "Customer credit is disabled", code: "CUSTOMER_CREDIT_DISABLED" },
  { match: "Customer is required only for FIADO", code: "CUSTOMER_REQUIREMENT_INVALID" },
  { match: "Cash received must be at least", code: "CASH_AMOUNT_INVALID" },
  { match: "YAPE does not accept cash received", code: "YAPE_AMOUNT_INVALID" },
  { match: "FIADO does not accept cash received", code: "CREDIT_AMOUNT_INVALID" },
  { match: "Quantity must be positive", code: "QUANTITY_INVALID" },
  { match: "UNIT products require whole-number", code: "UNIT_QUANTITY_INVALID" },
  { match: "Unsupported payment method", code: "PAYMENT_METHOD_INVALID" },
  { match: "At least one sale item", code: "SALE_ITEMS_INVALID" },
  { match: "Invalid sale item", code: "SALE_ITEM_INVALID" },
  { match: "Cash session is required", code: "CASH_SESSION_REQUIRED" },
  { match: "Authentication required", code: "AUTHENTICATION_REQUIRED" },
  { match: "POS access requires", code: "POS_ACCESS_FORBIDDEN" },
];

function parseStockItem(value: unknown): InsufficientStockItem | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const item = value as Record<string, unknown>;
  const productId = item.productId;
  const productName = item.productName;
  const unitType = item.unitType;
  const requestedQuantity = item.requestedQuantity;
  const availableStock = item.availableStock;
  if (
    typeof productId !== "string" || !productId.trim() ||
    typeof productName !== "string" || !productName.trim() ||
    (unitType !== "UNIT" && unitType !== "WEIGHT") ||
    (requestedQuantity !== undefined && (
      typeof requestedQuantity !== "string" ||
      !/^\d+(?:\.\d{1,3})?$/.test(requestedQuantity) ||
      !Number.isFinite(Number(requestedQuantity)) ||
      Number(requestedQuantity) < 0
    )) ||
    typeof availableStock !== "string" ||
    !/^\d+(?:\.\d{1,3})?$/.test(availableStock) ||
    !Number.isFinite(Number(availableStock)) ||
    Number(availableStock) < 0
  ) return undefined;

  return { productId, productName, unitType, requestedQuantity, availableStock };
}

function parseInsufficientStockDetails(raw: unknown): InsufficientStockMetadata | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) return undefined;
  const value = parsed as Record<string, unknown>;
  if (value.code !== "INSUFFICIENT_STOCK") return undefined;

  if (Array.isArray(value.items)) {
    if (value.version !== 2 || value.items.length === 0) return undefined;
    const items = value.items.map(parseStockItem);
    if (items.some((item): item is undefined => item === undefined)) return undefined;
    return { code: "INSUFFICIENT_STOCK", version: 2, items: items as InsufficientStockItem[] };
  }

  const legacyItem = parseStockItem(value);
  if (!legacyItem || legacyItem.requestedQuantity !== undefined) return undefined;
  return { code: "INSUFFICIENT_STOCK", version: 2, items: [legacyItem] };
}

export function classifyConfirmSaleError(raw: string, details?: unknown): ConfirmSaleResult {
  const message = raw.replace(/^Error:\s*/i, "").trim();
  const known = DEFINITIVE_ERROR_CODES.find(({ match }) => message.includes(match));
  if (known) {
    const stock = known.code === "INSUFFICIENT_STOCK" ? parseInsufficientStockDetails(details) : undefined;
    return stock
      ? { ok: false, kind: "DEFINITIVE", code: known.code, error: message, stock }
      : { ok: false, kind: "DEFINITIVE", code: known.code, error: message };
  }
  return { ok: false, kind: "UNKNOWN", code: "UNKNOWN_SERVER_ERROR", error: message || "Sale confirmation failed" };
}

export function insufficientStockItems(details: InsufficientStockMetadata): InsufficientStockItem[] {
  return "items" in details ? details.items : [details];
}

export function formatInsufficientStockItem(item: InsufficientStockItem, includeGuidance = true): string {
  const available = formatQuantity(item.availableStock, item.unitType);
  const unitLabel = item.unitType === "WEIGHT" ? "kg" : available === "1" ? "unidad" : "unidades";
  const guidance = includeGuidance ? " Ajusta la cantidad o retíralo." : "";
  return `Stock insuficiente para ${item.productName}. Disponible actualmente: ${available} ${unitLabel}.${guidance}`;
}

export function formatInsufficientStockMessage(details: InsufficientStockMetadata): string {
  return formatInsufficientStockItem(insufficientStockItems(details)[0]);
}
