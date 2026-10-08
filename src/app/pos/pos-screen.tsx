"use client";

import Link from "next/link";
import { ScanLine, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { OperationalHeader } from "@/app/pos/operational-header";
import { confirmSale } from "@/features/pos/actions";
import { getCurrentCashSessionState } from "@/features/cash/actions";
import { getPosCustomer, searchPosCustomers } from "@/features/pos/customers";
import { addProduct, removeProduct, updateQuantity } from "@/features/pos/cart";
import { findByBarcode, searchProducts } from "@/features/pos/catalog";
import { parseSignedCents } from "@/features/customers/validation";
import { formatQuantity } from "@/features/catalog/products/validation";
import { formatInsufficientStockMessage, insufficientStockItems } from "@/features/pos/errors";
import type { CartLine, InsufficientStockMetadata, PaymentMethod, PosCustomer, PosProduct } from "@/features/pos/types";
import {
  createSubmittedSnapshot,
  type SaleIntent,
  type SaleIntentCustomer,
  type SaleIntentDraft,
  type SaleIntentProduct,
} from "@/features/pos/intent";
import {
  createDraftIntent,
  clearDraftIntent,
  cleanupConfirmedIntentForOwner,
  discardConflictIntent,
  discardFailedIntent,
  deleteConfirmedIntent,
  loadActiveIntentForOwner,
  markSubmittingAsUncertain,
  persistSubmittedIntent,
  recordSaleIntentError,
  replaceFailedIntentWithDraft,
  transitionSaleIntent,
  updateDraftIntent,
} from "@/features/pos/persistence";
import {
  decrementIntegerQuantity,
  formatCents,
  formatMoney,
  incrementIntegerQuantity,
  lineTotalCents,
  parseCents,
  parseThousandths,
  sanitizeDecimalInput,
} from "@/features/pos/money";

function toPosErrorMessage(raw: string, code?: string, stockDetails?: InsufficientStockMetadata): string {
  const message = raw.replace(/^Error:\s*/i, "").trim();

  if (code === "AUTHENTICATION_REQUIRED" || message === "Authentication required") {
    return "Autenticación requerida.";
  }
  if (code === "POS_ACCESS_FORBIDDEN" || message.includes("POS access requires")) {
    return "El acceso al POS requiere rol ADMIN o SELLER.";
  }
  if (code === "PRODUCT_NOT_FOUND" || message === "Product not found") {
    return "Producto no encontrado.";
  }
  if (code === "PRODUCT_UNAVAILABLE" || message === "Product is inactive or unavailable") {
    return "Producto inactivo o no disponible.";
  }
  const stockMatch = message.match(/^Insufficient stock for product (.+)$/);
  if (code === "INSUFFICIENT_STOCK" || stockMatch) {
    if (stockDetails) {
      return formatInsufficientStockMessage(stockDetails);
    }
    return `Stock insuficiente para ${stockMatch ? stockMatch[1] : "este producto"}. Ajusta la cantidad o retíralo.`;
  }
  if (code === "QUANTITY_INVALID" || message.includes("Quantity must be positive")) {
    return "La cantidad debe ser positiva con máximo 3 decimales.";
  }
  if (code === "UNIT_QUANTITY_INVALID" || message.includes("UNIT products require whole-number")) {
    return "Los productos UNIT requieren cantidades enteras.";
  }
  if (code === "CASH_AMOUNT_INVALID" || message.includes("Cash received must be at least")) {
    return "El monto recibido debe ser igual o mayor al total.";
  }
  if (code === "YAPE_AMOUNT_INVALID" || message.includes("YAPE does not accept cash received")) {
    return "YAPE no acepta monto en efectivo.";
  }
  if (code === "CUSTOMER_NOT_FOUND" || message.includes("Customer not found")) {
    return "Cliente no encontrado. Solicita al administrador registrarlo.";
  }
  if (code === "CUSTOMER_INACTIVE" || message.includes("Customer is inactive")) {
    return "El cliente está inactivo.";
  }
  if (code === "CUSTOMER_CREDIT_DISABLED" || message.includes("Customer credit is disabled")) {
    return "El crédito está deshabilitado para este cliente.";
  }
  if (code === "CREDIT_LIMIT_EXCEEDED" || message.includes("Credit limit exceeded")) {
    return "Crédito insuficiente para esta venta.";
  }
  if (code === "CUSTOMER_REQUIREMENT_INVALID" || message.includes("Customer is required only for FIADO")) {
    return "Selecciona un cliente para la venta fiada.";
  }
  if (code === "CREDIT_AMOUNT_INVALID" || message.includes("FIADO does not accept cash received")) {
    return "La venta fiada no usa monto recibido.";
  }
  if (message.includes("Customer access requires")) {
    return "No tienes acceso a clientes.";
  }
  if (code === "OPEN_CASH_SESSION_REQUIRED" || message.includes("Open cash session is required")) {
    return "La caja está cerrada. Abre una caja para continuar.";
  }
  if (code === "CASH_SESSION_REQUIRED" || message.includes("Cash session is required")) {
    return "Se requiere una caja abierta para continuar.";
  }
  if (code === "SALE_ITEMS_INVALID" || message.includes("At least one sale item")) {
    return "Agrega al menos un producto.";
  }
  if (code === "PAYMENT_METHOD_INVALID" || message.includes("Unsupported payment method")) {
    return "Método de pago no admitido.";
  }
  if (code === "SALE_IDEMPOTENCY_CONFLICT" || message.includes("SALE_IDEMPOTENCY_CONFLICT")) {
    return "No se puede recuperar esta venta automáticamente. Solicita revisión al administrador.";
  }
  if (message.includes("sales_client_key_unique_idx")) {
    return "Esta venta ya fue registrada.";
  }
  if (code === "UNKNOWN_SERVER_ERROR" || code === "UNKNOWN_RESULT") {
    return "No pudimos verificar la venta. Revisa tu conexión e intenta nuevamente.";
  }

  return message;
}

function cartFromIntent(items: SaleIntentProduct[]): CartLine[] {
  return items.map((item) => ({
    id: item.productId,
    name: item.productName,
    barcode: null,
    unit_type: item.unitType,
    selling_price: item.sellingPrice,
    is_active: true,
    stock_quantity: "",
    quantity: item.quantity,
  }));
}

function draftFromState(
  cart: CartLine[],
  paymentMethod: PaymentMethod,
  amountReceived: string,
  customer: SaleIntentCustomer | null,
  cashSessionId: string | null,
): SaleIntentDraft {
  return {
    cashSessionId,
    paymentMethod,
    amountReceived,
    customer: customer ? { ...customer } : null,
    items: cart.map((line) => ({
      productId: line.id,
      productName: line.name,
      unitType: line.unit_type,
      sellingPrice: line.selling_price,
      quantity: line.quantity,
    })),
  };
}

function customerDisplay(customer: PosCustomer): SaleIntentCustomer {
  return { id: customer.id, name: customer.name, phone: customer.phone };
}

function paymentMethodLabel(method: PaymentMethod): string {
  return method === "CASH" ? "Efectivo" : method === "YAPE" ? "Yape" : "Fiado";
}

function restoredIntentMessage(restored: SaleIntent): string {
  switch (restored.state) {
    case "DRAFT":
      return "";
    case "SUBMITTING":
      return "Procesando venta...";
    case "UNCERTAIN":
      return restored.lastError
        ? toPosErrorMessage(restored.lastError.message, restored.lastError.code, restored.lastError.stock)
        : "Hay una venta pendiente de verificar.";
    case "FAILED":
      return restored.lastError
        ? toPosErrorMessage(restored.lastError.message, restored.lastError.code, restored.lastError.stock)
        : "No se pudo completar la venta.";
    case "CONFLICT":
      return "La operación requiere revisión administrativa.";
    case "CONFIRMED":
      return "";
    default: {
      const unexpectedState: never = restored.state;
      throw new Error(`Unexpected sale intent state: ${String(unexpectedState)}`);
    }
  }
}

export function PosScreen({ userId, userRole, sellerName, initialCashSessionOpen, initialCashSessionId }: { userId: string; userRole: "ADMIN" | "SELLER"; sellerName: string; initialCashSessionOpen: boolean; initialCashSessionId: string | null }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountReceived, setAmountReceived] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState(false);
  const [intent, setIntent] = useState<SaleIntent | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState("");
  const [persistenceError, setPersistenceError] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const [tabBlocked, setTabBlocked] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<PosCustomer[]>([]);
  const [customerSearched, setCustomerSearched] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer | null>(null);
  const [selectedCustomerDisplay, setSelectedCustomerDisplay] = useState<SaleIntentCustomer | null>(null);
  const [customerFresh, setCustomerFresh] = useState(false);
  const [cashSessionOpen, setCashSessionOpen] = useState(initialCashSessionOpen);
  const [cashSessionId, setCashSessionId] = useState<string | null>(initialCashSessionId);
  const [isPending, startTransition] = useTransition();
  const productInputRef = useRef<HTMLInputElement>(null);
  const scannerFocusPendingRef = useRef(false);
  const [scannerFocusRequest, setScannerFocusRequest] = useState(0);
  const tabIdRef = useRef(crypto.randomUUID());
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveGenerationRef = useRef(0);
  const emptyCleanupKeyRef = useRef<string | null>(null);
  const emptyCleanupFailedKeyRef = useRef<string | null>(null);
  const emptyCleanupPendingRef = useRef(false);
  const previousBlockingStateRef = useRef<"FAILED" | "UNCERTAIN" | "CONFLICT" | null>(null);

  const totalCents = cart.reduce((sum, line) => {
    const lineTotal = lineTotalCents(line.selling_price, line.quantity, line.unit_type);
    return lineTotal === null ? sum : sum + lineTotal;
  }, BigInt(0));
  const receivedCents = parseCents(amountReceived);
  const exactCashPayment = paymentMethod === "CASH" && amountReceived.trim() === "";
  const changeCents = exactCashPayment ? BigInt(0) : receivedCents === null ? null : receivedCents - totalCents;
  const availableCreditCents =
    selectedCustomer === null ? null : parseSignedCents(selectedCustomer.available_credit);
  const customerUsable =
    customerFresh && selectedCustomer !== null && selectedCustomer.active && selectedCustomer.credit_enabled;
  const creditOk =
    customerUsable && availableCreditCents !== null && totalCents <= availableCreditCents;
  const cashValidationMessage = paymentMethod === "CASH" && amountReceived.trim()
    ? receivedCents === null
      ? "Ingresa un monto válido."
      : receivedCents < totalCents
        ? "El monto recibido es menor al total."
        : ""
    : "";
  const creditValidationMessage = paymentMethod === "CREDIT"
    ? selectedCustomerDisplay === null
      ? "Selecciona un cliente para continuar."
      : selectedCustomer === null
        ? "Actualizando los datos del cliente…"
        : !selectedCustomer.active
          ? "El cliente está inactivo."
          : !selectedCustomer.credit_enabled
            ? "El crédito está deshabilitado para este cliente."
            : availableCreditCents !== null && totalCents > availableCreditCents
              ? "El crédito disponible no cubre este total."
              : ""
    : "";
  const paymentActionLabel = paymentMethod === "CASH"
    ? `Cobrar S/. ${formatCents(totalCents)}`
    : paymentMethod === "YAPE"
      ? `Confirmar Yape S/. ${formatCents(totalCents)}`
      : `Registrar fiado S/. ${formatCents(totalCents)}`;
  const draftIntentKey = intent?.state === "DRAFT" ? intent.clientKey : null;
  const canConfirm =
    !hydrating && !tabBlocked && !localBusy && intent?.state === "DRAFT" &&
    cart.length > 0 &&
    cart.every((line) => {
      const quantity = parseThousandths(line.quantity);
      return quantity !== null && quantity > BigInt(0) &&
        (line.unit_type === "WEIGHT" || quantity % BigInt(1000) === BigInt(0));
    }) &&
    (paymentMethod === "YAPE" ||
      paymentMethod === "CREDIT" ||
      (exactCashPayment || (receivedCents !== null && receivedCents >= totalCents))) &&
    (paymentMethod !== "CREDIT" || creditOk);
  const blockingState = intent?.state === "FAILED" || intent?.state === "UNCERTAIN" || intent?.state === "CONFLICT"
    ? intent.state
    : null;

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        let currentCash: Awaited<ReturnType<typeof getCurrentCashSessionState>> | null = null;
        try {
          currentCash = await getCurrentCashSessionState();
          if (!cancelled) {
            setCashSessionOpen(currentCash.kind === "OPEN");
            setCashSessionId(currentCash.kind === "OPEN" ? currentCash.session.session_id : null);
          }
        } catch (error) {
          console.error(error);
        }

        await cleanupConfirmedIntentForOwner(userId);
        let restored = await loadActiveIntentForOwner(userId);
        if (restored?.state === "SUBMITTING") {
          restored = await markSubmittingAsUncertain(userId, restored.clientKey);
        }
        if (cancelled) return;

        if (!restored) {
          setHydrating(false);
          return;
        }

        if (restored.state === "DRAFT") {
          let draftIntent = restored;
          const currentSessionId = currentCash?.kind === "OPEN" ? currentCash.session.session_id : null;
          if (currentSessionId && draftIntent.draft.cashSessionId !== currentSessionId) {
            draftIntent = await updateDraftIntent(userId, draftIntent.clientKey, {
              ...draftIntent.draft,
              cashSessionId: currentSessionId,
            });
          }

          setIntent(draftIntent);
          setRecoveredDraft(true);
          setCart(cartFromIntent(draftIntent.draft.items));
          setPaymentMethod(draftIntent.draft.paymentMethod);
          setAmountReceived(draftIntent.draft.amountReceived);
          setSelectedCustomerDisplay(draftIntent.draft.customer);
          setCustomerFresh(false);

          if (draftIntent.draft.customer) {
            try {
              const customer = await getPosCustomer(draftIntent.draft.customer.id);
              if (!cancelled) {
                setSelectedCustomer(customer);
                setSelectedCustomerDisplay(customerDisplay(customer));
                setCustomerFresh(true);
              }
            } catch (error) {
              console.error(error);
            }
          }
        } else {
          setIntent(restored);
          setMessage(restoredIntentMessage(restored));
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setHydrationError("No se pudo cargar el estado seguro del punto de venta.");
      } finally {
        if (!cancelled) setHydrating(false);
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (blockingState && previousBlockingStateRef.current !== blockingState) {
      window.scrollTo(0, 0);
    }
    previousBlockingStateRef.current = blockingState;
  }, [blockingState]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel("store-system-pos-tab");
    const tabId = tabIdRef.current;
    const send = (type: string, otherTabId: string) => channel.postMessage({ type, tabId: otherTabId });

    function handleMessage(event: MessageEvent<{ type?: string; tabId?: string }>) {
      const otherTabId = event.data?.tabId;
      if (!otherTabId || otherTabId === tabId) return;

      if (event.data.type === "POS_TAB_HELLO") {
        if (otherTabId < tabId) setTabBlocked(true);
        else send("POS_TAB_ACTIVE", tabId);
      }
      if (event.data.type === "POS_TAB_ACTIVE" && otherTabId < tabId) setTabBlocked(true);
      if (event.data.type === "POS_TAB_RELEASE") setTabBlocked(false);
    }

    channel.addEventListener("message", handleMessage);
    channel.postMessage({ type: "POS_TAB_HELLO", tabId });
    const release = () => send("POS_TAB_RELEASE", tabId);
    window.addEventListener("beforeunload", release);

    return () => {
      window.removeEventListener("beforeunload", release);
      channel.removeEventListener("message", handleMessage);
      channel.close();
    };
  }, []);

  useEffect(() => {
    if (hydrating || !draftIntentKey) return;

    if (cart.length === 0) {
      const clientKey = draftIntentKey;
      autosaveGenerationRef.current += 1;
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (emptyCleanupKeyRef.current === clientKey) return;
      if (emptyCleanupFailedKeyRef.current === clientKey) return;

      emptyCleanupKeyRef.current = clientKey;
      emptyCleanupPendingRef.current = false;
      setLocalBusy(true);
      void clearDraftIntent(userId, clientKey)
        .then(() => {
          if (emptyCleanupKeyRef.current !== clientKey) return;
          emptyCleanupKeyRef.current = null;
          emptyCleanupFailedKeyRef.current = null;
          emptyCleanupPendingRef.current = false;
          setRecoveredDraft(false);
          setIntent((current) => current?.clientKey === clientKey ? null : current);
          setPersistenceError("");
          setLocalBusy(false);
        })
        .catch((error) => {
          if (emptyCleanupKeyRef.current !== clientKey) return;
          console.error(error);
          setPersistenceError("No se pudo guardar la venta localmente.");
          emptyCleanupKeyRef.current = null;
          emptyCleanupFailedKeyRef.current = clientKey;
          emptyCleanupPendingRef.current = false;
          setLocalBusy(false);
        });
      return;
    }

    if (localBusy || emptyCleanupKeyRef.current !== null) return;

    const clientKey = draftIntentKey;
    const draft = draftFromState(cart, paymentMethod, amountReceived, selectedCustomerDisplay, cashSessionId);
    const generation = ++autosaveGenerationRef.current;
    const timer = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      if (generation !== autosaveGenerationRef.current || emptyCleanupKeyRef.current !== null) return;
      void updateDraftIntent(userId, clientKey, draft)
        .then((updated) => {
          if (generation !== autosaveGenerationRef.current || emptyCleanupKeyRef.current !== null) return;
          setIntent((current) => current?.clientKey === clientKey && current.state === "DRAFT" ? updated : current);
          setPersistenceError("");
        })
        .catch((error) => {
          if (generation !== autosaveGenerationRef.current || emptyCleanupKeyRef.current !== null) return;
          console.error(error);
          setPersistenceError("No se pudo guardar la venta localmente.");
        });
    }, 150);
    autosaveTimerRef.current = timer;

    return () => {
      autosaveGenerationRef.current += 1;
      window.clearTimeout(timer);
      if (autosaveTimerRef.current === timer) autosaveTimerRef.current = null;
    };
  }, [userId, hydrating, localBusy, draftIntentKey, cart, paymentMethod, amountReceived, selectedCustomerDisplay, cashSessionId]);

  useEffect(() => {
    if (cashSessionOpen) requestScannerFocus();
  }, [cashSessionOpen]);

  useEffect(() => {
    if (!scannerFocusPendingRef.current || hydrating || !cashSessionOpen || localBusy || isPending) return;

    const input = productInputRef.current;
    if (!input || input.disabled) return;

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement && activeElement !== input) return;

    input.focus();
    scannerFocusPendingRef.current = false;
  }, [cashSessionOpen, hydrating, isPending, localBusy, scannerFocusRequest]);

  useEffect(() => {
    let cancelled = false;
    const term = query.trim();
    if (!term) return;

    const timer = window.setTimeout(async () => {
      try {
        const products = await searchProducts(term);
        if (!cancelled) {
          setResults(products);
          setSearching(false);
        }
      } catch {
        if (!cancelled) {
          setMessage("No se pudo buscar productos.");
          setSearching(false);
        }
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const term = customerQuery.trim();
    if (!customerOpen) return;

    const timer = window.setTimeout(async () => {
      try {
        const customers = await searchPosCustomers(term);
        if (!cancelled) {
          setCustomerResults(customers);
          setCustomerSearched(true);
          setCustomerLoading(false);
        }
      } catch {
        if (!cancelled) {
          setCustomerResults([]);
          setCustomerSearched(false);
          setCustomerLoading(false);
          setCustomerError("No se pudieron cargar los clientes. Intenta de nuevo.");
        }
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customerOpen, customerQuery]);

  function resetCustomer(open = false) {
    setSelectedCustomer(null);
    setSelectedCustomerDisplay(null);
    setCustomerFresh(false);
    setCustomerQuery("");
    setCustomerResults([]);
    setCustomerSearched(false);
    setCustomerError("");
    setCustomerLoading(open);
    setCustomerOpen(open);
  }

  function selectCustomer(customer: PosCustomer) {
    setSelectedCustomer(customer);
    setSelectedCustomerDisplay(customerDisplay(customer));
    setCustomerFresh(true);
    setCustomerQuery("");
    setCustomerResults([]);
    setCustomerSearched(false);
    setCustomerError("");
    setCustomerLoading(false);
    setCustomerOpen(false);
  }

  function requestScannerFocus() {
    scannerFocusPendingRef.current = true;
    setScannerFocusRequest((current) => current + 1);
  }

  function keepScannerReady() {
    setQuery("");
    setResults([]);
    setSearching(false);
    requestScannerFocus();
  }

  async function correctFailedIntent() {
    if (localBusy || isPending || tabBlocked || intent?.state !== "FAILED") return;

    setLocalBusy(true);
    try {
      const currentCash = await getCurrentCashSessionState();
      if (currentCash.kind !== "OPEN") {
        setCashSessionOpen(false);
        setCashSessionId(null);
        setPersistenceError("Abre una caja para corregir esta venta.");
        return;
      }

      const replacement = await replaceFailedIntentWithDraft(userId, intent.clientKey, {
        ...intent.draft,
        cashSessionId: currentCash.session.session_id,
      });
      setIntent(replacement);
      setCart(cartFromIntent(replacement.draft.items));
      setPaymentMethod(replacement.draft.paymentMethod);
      setAmountReceived(replacement.draft.amountReceived);
      setSelectedCustomerDisplay(replacement.draft.customer);
      setSelectedCustomer(null);
      setCustomerFresh(false);
      setCashSessionOpen(true);
      setCashSessionId(currentCash.session.session_id);
      setMessage("");
      setPersistenceError("");
      setRecoveredDraft(false);

      if (replacement.draft.customer) {
        try {
          const customer = await getPosCustomer(replacement.draft.customer.id);
          setSelectedCustomer(customer);
          setSelectedCustomerDisplay(customerDisplay(customer));
          setCustomerFresh(true);
        } catch (error) {
          console.error(error);
        }
      }
    } catch (error) {
      console.error(error);
      setPersistenceError("No se pudo preparar la venta corregida de forma segura.");
    } finally {
      setLocalBusy(false);
    }
  }

  async function discardFailed() {
    if (localBusy || isPending || tabBlocked || intent?.state !== "FAILED") return;
    if (!window.confirm("¿Descartar esta operación fallida?")) return;

    setLocalBusy(true);
    try {
      await discardFailedIntent(userId, intent.clientKey);
      setIntent(null);
      setCart([]);
      setPaymentMethod("CASH");
      setAmountReceived("");
      resetCustomer();
      setMessage("");
      setPersistenceError("");
      setRecoveredDraft(false);
    } catch (error) {
      console.error(error);
      setPersistenceError("No se pudo descartar la operación. Intenta nuevamente.");
    } finally {
      setLocalBusy(false);
    }
  }

  async function verifyUncertain() {
    if (localBusy || isPending || tabBlocked || intent?.state !== "UNCERTAIN") return;
    const pendingIntent = intent;
    if (!pendingIntent.submitted) {
      setPersistenceError("No se encontró la información segura de esta venta.");
      return;
    }

    setLocalBusy(true);
    try {
      let result: Awaited<ReturnType<typeof confirmSale>>;
      try {
        result = await confirmSale(pendingIntent.submitted);
      } catch (error) {
        const raw = error instanceof Error ? error.message : "Unknown sale recovery failure";
        try {
          const updated = await recordSaleIntentError(userId, pendingIntent.clientKey, {
            kind: "UNKNOWN",
            code: "UNKNOWN_RESULT",
            message: raw,
          });
          setIntent(updated);
          setMessage("No pudimos verificar la venta. Revisa tu conexión e intenta nuevamente.");
        } catch (persistenceFailure) {
          console.error(persistenceFailure);
          setPersistenceError("No se pudo actualizar el estado seguro de la venta.");
        }
        return;
      }

      if (!result.ok) {
        try {
          const updated = await recordSaleIntentError(userId, pendingIntent.clientKey, {
            kind: result.kind,
            code: result.code,
            message: result.error,
            stock: result.stock,
          });
          setIntent(updated);
          setMessage(toPosErrorMessage(result.error, result.code, result.stock));
        } catch (persistenceFailure) {
          console.error(persistenceFailure);
          setPersistenceError("No se pudo actualizar el estado seguro de la venta.");
        }
        return;
      }

      let confirmed: SaleIntent;
      try {
        confirmed = await transitionSaleIntent(userId, pendingIntent.clientKey, "CONFIRMED");
        setIntent(confirmed);
      } catch (error) {
        console.error(error);
        setMessage("La venta fue confirmada, pero no se pudo finalizar su registro local.");
        return;
      }

      let localCleanupPending = false;
      try {
        await deleteConfirmedIntent(userId, confirmed.clientKey);
      } catch (error) {
        console.error(error);
        localCleanupPending = true;
        setPersistenceError("La venta fue confirmada, pero queda un registro local pendiente de limpieza.");
      }

      setIntent(null);
      setSuccess(`Venta recuperada · ${formatMoney(result.sale.total)}`);
      setCart([]);
      setAmountReceived("");
      setPaymentMethod("CASH");
      resetCustomer();
      setMessage("");
      setRecoveredDraft(false);
      if (!localCleanupPending) setPersistenceError("");
      window.setTimeout(() => setSuccess(null), 2500);
    } finally {
      setLocalBusy(false);
    }
  }

  async function discardConflict() {
    if (userRole !== "ADMIN" || localBusy || isPending || tabBlocked || intent?.state !== "CONFLICT") return;
    if (!window.confirm("Confirma que un administrador revisó esta operación antes de descartarla.")) return;

    setLocalBusy(true);
    try {
      await discardConflictIntent(userId, intent.clientKey);
      setIntent(null);
      setCart([]);
      setPaymentMethod("CASH");
      setAmountReceived("");
      resetCustomer();
      setMessage("");
      setPersistenceError("");
      setRecoveredDraft(false);
    } catch (error) {
      console.error(error);
      setPersistenceError("No se pudo resolver la operación. Intenta nuevamente.");
    } finally {
      setLocalBusy(false);
    }
  }

  async function putProductInCart(product: PosProduct, refocusScanner = true) {
    if (hydrating || tabBlocked || localBusy || emptyCleanupPendingRef.current || emptyCleanupKeyRef.current !== null || (intent !== null && intent.state !== "DRAFT")) return;
    if (!product.is_active) {
      setMessage("Producto inactivo.");
      if (refocusScanner) keepScannerReady();
      return;
    }

    emptyCleanupFailedKeyRef.current = null;
    const nextCart = addProduct(cart, product);
    if (!intent) {
      setLocalBusy(true);
      try {
        const created = await createDraftIntent(
          userId,
          draftFromState(nextCart, paymentMethod, amountReceived, selectedCustomerDisplay, cashSessionId),
        );
        setIntent(created);
        setCart(nextCart);
        setPersistenceError("");
      } catch (error) {
        console.error(error);
        setPersistenceError("No se pudo preparar la venta de forma segura. Intenta nuevamente.");
      } finally {
        setLocalBusy(false);
      }
    } else {
      setCart(nextCart);
    }
    setQuery("");
    setResults([]);
    setSearching(false);
    setMessage("");
    if (refocusScanner) keepScannerReady();
  }

  async function handleProductSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;

    setQuery("");
    setResults([]);
    setSearching(false);

    try {
      const product = await findByBarcode(value);
      if (!product) {
        setMessage("Código no encontrado.");
        keepScannerReady();
        return;
      }
      void putProductInCart(product);
    } catch {
      setMessage("No se pudo leer el código.");
      keepScannerReady();
    }
  }

  function submitSale() {
    if (!canConfirm || isPending) return;
    if (!cashSessionId) {
      setMessage("La caja está cerrada. Abre una caja para continuar.");
      return;
    }
    if (!intent || intent.state !== "DRAFT") return;

    const draftIntent = intent;
    const effectiveAmountReceived = paymentMethod === "CASH"
      ? exactCashPayment ? formatCents(totalCents) : amountReceived
      : null;

    setLocalBusy(true);
    startTransition(async () => {
      let submitted: Awaited<ReturnType<typeof createSubmittedSnapshot>>;
      let currentDraft: SaleIntent;

      // Phase A: persist the exact request before crossing the economic boundary.
      try {
        currentDraft = await updateDraftIntent(
          userId,
          draftIntent.clientKey,
          draftFromState(cart, paymentMethod, amountReceived, selectedCustomerDisplay, cashSessionId),
        );
        submitted = createSubmittedSnapshot(currentDraft, effectiveAmountReceived);
        const submitting = await persistSubmittedIntent(userId, currentDraft.clientKey, submitted);
        setIntent(submitting);
        setPersistenceError("");
      } catch (error) {
        console.error(error);
        setPersistenceError("No se pudo preparar la venta de forma segura. Intenta nuevamente.");
        setLocalBusy(false);
        return;
      }

      // Phase B: only an exception while invoking confirmSale is economic UNKNOWN.
      let result: Awaited<ReturnType<typeof confirmSale>>;
      try {
        result = await confirmSale(submitted);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown sale confirmation failure";
        try {
          const uncertain = await recordSaleIntentError(userId, draftIntent.clientKey, {
            kind: "UNKNOWN",
            code: "UNKNOWN_RESULT",
            message,
          });
          setIntent(uncertain);
        } catch (persistenceFailure) {
          console.error(persistenceFailure);
          setPersistenceError("No se pudo actualizar el estado seguro de la venta.");
        }
        setMessage("No pudimos comprobar todavía si la venta fue registrada.");
        setLocalBusy(false);
        return;
      }

      // Phase C: the returned result is authoritative and must not be reclassified by cleanup.
      if (!result.ok) {
        try {
          const failed = await recordSaleIntentError(userId, currentDraft.clientKey, {
            kind: result.kind,
            code: result.code,
            message: result.error,
            stock: result.stock,
          });
          setIntent(failed);
          setMessage(toPosErrorMessage(result.error, result.code, result.stock));
        } catch (persistenceFailure) {
          console.error(persistenceFailure);
          setPersistenceError("No se pudo actualizar el estado seguro de la venta.");
        }
        if (result.code === "OPEN_CASH_SESSION_REQUIRED" || result.code === "CASH_SESSION_REQUIRED") {
          setCashSessionOpen(false);
          try {
            const current = await getCurrentCashSessionState();
            setCashSessionOpen(current.kind === "OPEN");
            setCashSessionId(current.kind === "OPEN" ? current.session.session_id : null);
          } catch (error) {
            console.error(error);
          }
        }
        requestScannerFocus();
        setLocalBusy(false);
        return;
      }

      // Phase D: local confirmation and cleanup cannot change the economic result.
      let confirmed: SaleIntent;
      try {
        confirmed = await transitionSaleIntent(userId, currentDraft.clientKey, "CONFIRMED");
        setIntent(confirmed);
      } catch (error) {
        console.error(error);
        setMessage("La venta fue confirmada, pero no se pudo finalizar su registro local.");
        setLocalBusy(false);
        return;
      }

      try {
        await deleteConfirmedIntent(userId, confirmed.clientKey);
      } catch (error) {
        console.error(error);
        setPersistenceError("La venta fue confirmada, pero queda un registro local pendiente de limpieza.");
      } finally {
        const total = formatMoney(result.sale.total);
        setIntent(null);
        setSuccess(`Venta confirmada · ${total}`);
        setCart([]);
        setAmountReceived("");
        setPaymentMethod("CASH");
        resetCustomer();
        setRecoveredDraft(false);
        setMessage("");
        window.setTimeout(() => setSuccess(null), 2500);
        requestScannerFocus();
        setLocalBusy(false);
      }
    });
  }

  if (hydrating) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-700"><p className="rounded-xl bg-white px-6 py-5 font-semibold shadow-sm">Cargando punto de venta…</p></main>;
  }

  if (hydrationError) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-700"><p className="rounded-xl bg-white px-6 py-5 font-semibold shadow-sm">{hydrationError}</p></main>;
  }

  if (tabBlocked) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-700"><p className="rounded-xl bg-white px-6 py-5 font-semibold shadow-sm">El punto de venta ya está abierto en otra pestaña.</p></main>;
  }

  if (intent?.state === "FAILED") {
    const stockDetails = intent.lastError?.code === "INSUFFICIENT_STOCK" ? intent.lastError.stock : undefined;
    const shortageItems = stockDetails ? insufficientStockItems(stockDetails) : [];
    return (
      <main className="flex min-h-screen items-start justify-center bg-slate-100 px-3 py-3 text-slate-700 sm:items-center sm:px-4 sm:py-4">
        <section className="w-full max-w-2xl rounded-2xl border border-red-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-2">
            <TriangleAlert aria-hidden="true" className="mt-1 size-7 shrink-0 text-red-600" />
            <div>
              <p className="text-xl font-black text-slate-950 sm:text-2xl">No se pudo completar la venta</p>
              {shortageItems.length > 0 ? <p className="text-xs font-black uppercase tracking-[0.16em] text-red-700">Stock insuficiente</p> : null}
            </div>
          </div>
          {shortageItems.length > 0 ? (
            <div className="mt-4 space-y-2" aria-label="Productos con stock insuficiente">
              {shortageItems.map((item) => {
                const available = formatQuantity(item.availableStock, item.unitType);
                const availableUnit = item.unitType === "WEIGHT" ? "kg" : available === "1" ? "unidad" : "unidades";
                const requested = item.requestedQuantity ? formatQuantity(item.requestedQuantity, item.unitType) : null;
                const requestedUnit = item.unitType === "WEIGHT" ? "kg" : requested === "1" ? "unidad" : "unidades";
                return (
                  <div key={item.productId} className="rounded-xl border border-red-200 bg-red-50/70 px-3 py-3">
                    <p className="text-base font-black text-slate-950 sm:text-lg">{item.productName}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {requested ? (
                        <div className="rounded-lg bg-white/80 px-2.5 py-1.5">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Solicitado</p>
                          <p className="mt-0.5 whitespace-nowrap text-lg font-bold tabular-nums text-slate-800 sm:text-xl">{requested} {requestedUnit}</p>
                        </div>
                      ) : null}
                      <div className={`${requested ? "" : "col-span-2"} rounded-lg border-2 border-red-300 bg-white px-2.5 py-1.5`}>
                        <p className="text-xs font-black uppercase tracking-wide text-red-700">Disponible</p>
                        <p className="mt-0.5 whitespace-nowrap text-lg font-black tabular-nums text-red-800 sm:text-xl">{available} {availableUnit}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <p className="pt-0.5 text-sm font-semibold text-slate-600">Ajusta las cantidades o retira los productos antes de volver a intentarlo.</p>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-4 text-left font-semibold text-red-900">
              {toPosErrorMessage(intent.lastError?.message ?? message, intent.lastError?.code, intent.lastError?.stock)}
            </p>
          )}
          {shortageItems.length === 0 ? <p className="mt-3 text-left text-sm text-slate-600">La venta no quedó registrada. Corrige los datos para intentarlo con una nueva operación o descarta esta operación si ya no corresponde.</p> : null}
          {persistenceError ? <p className="mt-3 text-sm font-semibold text-red-700">{persistenceError}</p> : null}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={localBusy || isPending}
              onClick={() => void correctFailedIntent()}
              className="min-h-14 rounded-xl bg-blue-600 px-4 text-lg font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {localBusy ? "Preparando…" : "Corregir y reintentar"}
            </button>
            <button
              type="button"
              disabled={localBusy || isPending}
              onClick={() => void discardFailed()}
              className="min-h-14 rounded-xl border border-slate-300 px-4 text-lg font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Descartar sin registrar
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (intent?.state === "UNCERTAIN") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-700">
        <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <p className="text-2xl font-black text-slate-950">Hay una venta pendiente de verificar</p>
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-4 text-left font-semibold text-amber-900">
            No sabemos si esta venta fue registrada. No inicies otra venta hasta verificarla o reintentarla.
          </p>
          {intent.submitted ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-700">
              <p className="font-bold text-slate-900">Operación guardada</p>
              <p className="mt-1">{paymentMethodLabel(intent.submitted.payment_method)} · {intent.submitted.items.length} {intent.submitted.items.length === 1 ? "línea" : "líneas"}{intent.draft.customer ? ` · ${intent.draft.customer.name}` : ""}</p>
            </div>
          ) : null}
          {persistenceError ? <p className="mt-3 text-sm font-semibold text-red-700">{persistenceError}</p> : null}
          <button
            type="button"
            disabled={localBusy || isPending}
            onClick={() => void verifyUncertain()}
            className="mt-6 min-h-14 w-full rounded-xl bg-blue-600 px-4 text-lg font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {localBusy ? "Verificando venta…" : "Verificar o reintentar"}
          </button>
        </section>
      </main>
    );
  }

  if (intent?.state === "CONFLICT") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-700">
        <section className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <p className="text-2xl font-black text-slate-950">No se puede recuperar esta venta automáticamente</p>
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-4 text-left font-semibold text-red-900">
            La operación no coincide con el registro existente. Solicita revisión al administrador antes de continuar.
          </p>
          {persistenceError ? <p className="mt-3 text-sm font-semibold text-red-700">{persistenceError}</p> : null}
          {userRole === "ADMIN" ? (
            <button
              type="button"
              disabled={localBusy || isPending}
              onClick={() => void discardConflict()}
              className="mt-6 min-h-14 w-full rounded-xl border border-slate-300 px-4 text-lg font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {localBusy ? "Resolviendo…" : "Descartar después de revisar"}
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  if (intent?.state === "CONFIRMED") {
    if (process.env.NODE_ENV !== "production") {
      throw new Error("Confirmed sale intent must be cleaned before rendering");
    }
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-700"><p className="rounded-xl bg-white px-6 py-5 text-center font-semibold shadow-sm">No se pudo cargar el punto de venta.</p></main>;
  }

  if (!cashSessionOpen) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <OperationalHeader sellerName={sellerName} userRole={userRole} cashSessionOpen={cashSessionOpen} />
        <section className="mx-auto flex min-h-[calc(100vh-86px)] max-w-xl items-center px-4 py-8">
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
            <p className="text-2xl font-black">Caja cerrada</p>
            <p className="mt-3 text-slate-600">Debes abrir caja antes de realizar ventas.</p>
            <Link href="/cash" className="mt-6 inline-flex min-h-14 items-center rounded-xl bg-primary px-6 text-lg font-black text-primary-foreground hover:bg-primary/90">
              Abrir caja
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <OperationalHeader sellerName={sellerName} userRole={userRole} cashSessionOpen={cashSessionOpen} />

      {recoveredDraft ? (
        <div className="mx-auto max-w-[1600px] px-3 pt-3 sm:px-5">
          <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">Venta recuperada de forma segura. Revisa los datos antes de confirmar.</p>
        </div>
      ) : null}
      {persistenceError ? (
        <div className="mx-auto max-w-[1600px] px-3 pt-3 sm:px-5">
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900"><span className="font-black">Problema al guardar localmente:</span> {persistenceError}</p>
        </div>
      ) : null}

      <div className="mx-auto grid max-w-[1600px] gap-4 p-3 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] md:items-start">
        <section className="space-y-4">
          <form onSubmit={handleProductSubmit} className="rounded-2xl border border-blue-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="product-input" className="block text-sm font-bold text-slate-800">
                Buscar o escanear producto
              </label>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                <ScanLine aria-hidden="true" className="size-3.5" />
                Escáner o texto
              </span>
            </div>
            <input
              ref={productInputRef}
              id="product-input"
              value={query}
              disabled={localBusy || isPending}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                setMessage("");
                setResults([]);
                setSearching(Boolean(nextQuery.trim()));
              }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              placeholder="Escanea un código o escribe un nombre"
              className="h-14 w-full rounded-xl border-2 border-blue-500 px-4 text-xl outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
            {results.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Resultados de productos">
                {results.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    disabled={!product.is_active || localBusy || isPending}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void putProductInCart(product, false)}
                    className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold">{product.name}</span>
                      <span className="text-xs text-slate-500">
                        {product.unit_type === "WEIGHT" ? "kg" : "unidad"} · stock {product.stock_quantity}
                      </span>
                    </span>
                    <span className="font-semibold">{formatMoney(product.selling_price)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <p className="mt-2 min-h-5 text-sm text-slate-500" aria-live="polite">
              {message || (searching ? "Buscando..." : query.trim() && results.length === 0 ? "No se encontró el producto." : "")}
            </p>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <h1 className="text-lg font-bold">Carrito</h1>
              <span className="text-sm text-slate-500" title="Productos distintos en el carrito">
                {cart.length} {cart.length === 1 ? "línea" : "líneas"}
              </span>
            </div>
            {cart.length === 0 ? (
              <p className="px-4 py-12 text-center text-slate-500">Escanea un producto o búscalo para comenzar.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {cart.map((line) => {
                  const lineTotal = lineTotalCents(line.selling_price, line.quantity, line.unit_type);
                  return (
                    <div key={line.id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{line.name}</p>
                          <p className="text-sm text-slate-500">{formatMoney(line.selling_price)} / {line.unit_type === "WEIGHT" ? "kg" : "unidad"}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <p className="text-right font-bold tabular-nums">{lineTotal === null ? "—" : formatMoney(formatCents(lineTotal))}</p>
                          <button
                            type="button"
                            onClick={() => {
                              if (!localBusy && !isPending) {
                                const nextCart = removeProduct(cart, line.id);
                                if (nextCart.length === 0 && intent?.state === "DRAFT") {
                                  emptyCleanupPendingRef.current = true;
                                  setLocalBusy(true);
                                }
                                setCart(nextCart);
                              }
                            }}
                            disabled={localBusy || isPending}
                            aria-label={`Quitar ${line.name} del carrito`}
                            title={`Quitar ${line.name} del carrito`}
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 aria-hidden="true" className="size-5" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cantidad</span>
                        <div className="flex items-center gap-2">
                          {line.unit_type === "UNIT" ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!localBusy && !isPending) {
                                  const nextCart = updateQuantity(cart, line.id, decrementIntegerQuantity(line.quantity));
                                  if (nextCart.length === 0 && intent?.state === "DRAFT") {
                                    emptyCleanupPendingRef.current = true;
                                    setLocalBusy(true);
                                  }
                                  setCart(nextCart);
                                }
                              }}
                              disabled={localBusy || isPending}
                              className="h-12 w-12 rounded-xl border border-slate-300 text-2xl font-bold hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
                              aria-label={`Reducir ${line.name}`}
                            >
                              −
                            </button>
                          ) : null}

                          {line.unit_type === "UNIT" ? (
                            <span className="flex h-12 min-w-16 items-center justify-center rounded-xl bg-slate-100 px-2 text-lg font-bold tabular-nums">
                              {line.quantity}
                            </span>
                          ) : (
                            <label className="flex h-12 items-center gap-1 rounded-xl border-2 border-slate-300 bg-white px-2 focus-within:border-blue-500 focus-within:bg-blue-50 focus-within:ring-4 focus-within:ring-blue-100">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={line.quantity}
                                disabled={localBusy || isPending}
                                onChange={(event) => {
                                  const next = sanitizeDecimalInput(event.target.value, 3);
                                  if (!localBusy && !isPending) setCart((current) => updateQuantity(current, line.id, next));
                                }}
                                autoComplete="off"
                                placeholder="0.000"
                                aria-label={`Peso de ${line.name}`}
                                className="w-20 bg-transparent text-right text-lg font-bold tabular-nums text-slate-950 outline-none placeholder:text-slate-400"
                              />
                              <span className="text-sm font-semibold text-slate-600">kg</span>
                            </label>
                          )}

                          {line.unit_type === "UNIT" ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!localBusy && !isPending) {
                                  setCart((current) => updateQuantity(current, line.id, incrementIntegerQuantity(line.quantity)));
                                }
                              }}
                              disabled={localBusy || isPending}
                              className="h-12 w-12 rounded-xl border border-slate-300 text-2xl font-bold hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
                              aria-label={`Aumentar ${line.name}`}
                            >
                              +
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </section>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:sticky md:top-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Pago</p>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
              {paymentMethodLabel(paymentMethod)}
            </span>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-950 px-4 py-4 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-300">Total</p>
            <p className="mt-1 text-4xl font-black tracking-tight tabular-nums sm:text-5xl">S/. {formatCents(totalCents)}</p>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {(["CASH", "YAPE", "CREDIT"] as const).map((method) => (
              <button
                key={method}
                type="button"
                aria-pressed={paymentMethod === method}
                disabled={localBusy || isPending}
                onClick={() => {
                  if (localBusy || isPending) return;
                  setPaymentMethod(method);
                  if (method === "YAPE") {
                    setAmountReceived("");
                  }
                   if (method !== "CREDIT") {
                     resetCustomer(false);
                   }
                }}
                className={`min-h-14 rounded-xl px-2 text-sm font-black transition-colors sm:text-base ${paymentMethod === method ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-200" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {method === "CASH" ? "EFECTIVO" : method === "YAPE" ? "YAPE" : "FIADO"}
              </button>
            ))}
          </div>

           {paymentMethod === "CREDIT" ? (
             <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
               <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-800">Cliente</p>
               <label htmlFor="customer-search" className="block text-sm font-semibold text-amber-900">
                  Buscar cliente
               </label>
               <input
                  id="customer-search"
                  type="search"
                  value={customerQuery}
                  disabled={localBusy || isPending}
                 onChange={(event) => {
                   setCustomerQuery(event.target.value);
                   setCustomerOpen(true);
                   setCustomerLoading(true);
                   setCustomerSearched(false);
                   setCustomerError("");
                 }}
                 onFocus={() => {
                   setCustomerOpen(true);
                   setCustomerLoading(true);
                   setCustomerSearched(false);
                   setCustomerError("");
                 }}
                 autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                 placeholder="Nombre o teléfono"
                 className="mt-2 h-14 w-full rounded-xl border-2 border-amber-300 bg-white px-4 text-base outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
               />

               {customerOpen && customerLoading ? (
                 <p className="mt-3 rounded-xl bg-white px-4 py-4 text-sm font-semibold text-slate-600">
                   Cargando clientes...
                 </p>
               ) : null}

               {customerOpen && !customerLoading && customerError ? (
                 <p className="mt-3 rounded-xl bg-white px-4 py-4 text-sm font-semibold text-red-700">
                   {customerError}
                 </p>
               ) : null}

               {customerOpen && !customerLoading && !customerError && customerResults.length > 0 ? (
                 <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                   {customerResults.map((customer) => (
                    <button
                      key={customer.id}
                       type="button"
                       disabled={localBusy || isPending}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectCustomer(customer)}
                      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 text-left hover:border-amber-400 hover:bg-amber-100"
                    >
                       <span className="min-w-0">
                         <span className="block truncate font-semibold">{customer.name}</span>
                         <span className="text-xs text-slate-500">
                           {customer.phone ?? "Sin teléfono"}
                         </span>
                       </span>
                     </button>
                   ))}
                 </div>
               ) : null}

               {customerOpen && !customerLoading && !customerError && customerSearched && customerResults.length === 0 ? (
                 <p className="mt-3 rounded-xl bg-white px-4 py-4 text-sm font-semibold text-slate-600">
                   No se encontraron clientes.
                   {customerQuery.trim() ? " Solicita al administrador registrarlo." : ""}
                 </p>
               ) : null}

               {selectedCustomerDisplay !== null ? (
                 <div className="mt-3 rounded-xl border border-amber-300 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate font-bold">{selectedCustomerDisplay.name}</p>
                      <button
                       type="button"
                       disabled={localBusy || isPending}
                      onMouseDown={(event) => event.preventDefault()}
                       onClick={() => resetCustomer(true)}
                      className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-amber-800 hover:bg-amber-50"
                    >
                      Cambiar
                    </button>
                   </div>
                    {selectedCustomer === null ? (
                      <p className="mt-2 text-sm text-slate-600">Actualizando datos del cliente…</p>
                    ) : <dl className="mt-2 space-y-1 text-sm">
                     <div className="flex items-center justify-between">
                       <dt className="text-slate-600">Nombre</dt>
                         <dd className="max-w-[65%] truncate text-right font-semibold">{selectedCustomer.name}</dd>
                     </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-600">Deuda actual</dt>
                      <dd className="font-semibold">{formatMoney(selectedCustomer.current_debt)}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-600">Límite</dt>
                      <dd className="font-semibold">{formatMoney(selectedCustomer.credit_limit)}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-600">Disponible</dt>
                      <dd className="font-bold">{formatMoney(selectedCustomer.available_credit)}</dd>
                    </div>
                   </dl>}
                </div>
              ) : null}
              {creditValidationMessage ? <p className="mt-3 text-sm font-semibold text-amber-950" role="status">{creditValidationMessage}</p> : null}
             </div>
           ) : null}

          {paymentMethod === "CASH" ? (
            <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Recibido</p>
              <label htmlFor="amount-received" className="block text-sm font-semibold text-slate-700">
                Monto recibido
              </label>
              <div className="relative">
                <input
                  id="amount-received"
                  type="text"
                  inputMode="decimal"
                  value={amountReceived}
                  disabled={localBusy || isPending}
                  onChange={(event) =>
                    !localBusy && !isPending && setAmountReceived(sanitizeDecimalInput(event.target.value, 2))
                  }
                  autoComplete="off"
                  placeholder="0.00"
                  className="h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-4 pr-14 text-2xl font-bold tabular-nums text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                  S/.
                </span>
              </div>

              <p className="text-xs text-slate-500">Déjalo vacío para pago exacto.</p>
              {cashValidationMessage ? <p className="text-sm font-semibold text-red-700" role="alert">{cashValidationMessage}</p> : null}
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900">
                <span className="font-semibold">Vuelto</span>
                <span className="text-xl font-black">{changeCents !== null && changeCents >= BigInt(0) ? `S/. ${formatCents(changeCents)}` : "—"}</span>
              </div>
            </div>
          ) : paymentMethod === "YAPE" ? (
            <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-4 text-sm text-violet-950">
              <p className="font-black">Confirma el pago en Yape</p>
              <p className="mt-1">Verifica que el pago esté realizado antes de confirmar.</p>
            </div>
          ) : null}

          {intent?.state === "SUBMITTING" ? <p className="mt-5 rounded-xl bg-blue-50 px-4 py-3 text-center font-bold text-blue-900" role="status">Procesando venta...</p> : null}
          {success ? <p className="mt-5 rounded-xl bg-emerald-100 px-4 py-3 text-center font-bold text-emerald-900" role="status">{success}</p> : null}
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={submitSale}
            disabled={!canConfirm || isPending}
            className="mt-5 min-h-16 w-full rounded-xl bg-emerald-600 px-4 text-xl font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isPending || intent?.state === "SUBMITTING" ? "Procesando…" : paymentActionLabel}
          </button>
        </aside>
      </div>
    </main>
  );
}
