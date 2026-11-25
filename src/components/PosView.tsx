'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Producto,
  Tasa,
  Tercero,
  TipoPago,
  CondicionPago,
  CuentaBancaria,
  TipoOperacionPago,
} from '@/types';
import { usePosCart, type CartItem } from '@/hooks/usePosCart';
import { usePosKeyboard, type PosKeyAction } from '@/hooks/usePosKeyboard';
import { calculateDualChange, round2 } from '@/lib/pos-calculations';
import { filterPosProducts } from '@/lib/pos-search';
import {
  isPosSoundEnabled,
  playPosAddBeep,
  playPosErrorTone,
  playPosSuccessChime,
  setPosSoundEnabled,
} from '@/lib/posSound';
import { useConfirm, useToast } from '@/components/ui/ToastProvider';
import PosTopBar, { resolveDefaultClient } from '@/components/pos/PosTopBar';
import PosClientSearchModal from '@/components/pos/PosClientSearchModal';
import PosQuickClientModal from '@/components/pos/PosQuickClientModal';
import PosShortcutsModal from '@/components/pos/PosShortcutsModal';
import PosCatalogPanel, { CATALOG_PAGE_SIZE } from '@/components/pos/PosCatalogPanel';
import PosCartPanel from '@/components/pos/PosCartPanel';
import PosParkedOrdersModal, { type ParkedSale } from '@/components/pos/PosParkedOrdersModal';
import PosCheckoutModal from '@/components/pos/PosCheckoutModal';
import PosReceiptModal, { type CompletedOrderReceipt } from '@/components/pos/PosReceiptModal';

export type { CartItem };

const PARKED_SALES_KEY = 'pos_parked_sales_v1';

function loadParkedSales(): ParkedSale[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(PARKED_SALES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ParkedSale[]) : [];
  } catch {
    return [];
  }
}

function getDefaultDueDate(days = 15): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

interface PosViewProps {
  products: Producto[];
  currentRate: Tasa | null;
  onOrderCompleted: () => void;
  onOpenRates: () => void;
  onNavigatePagos?: (actionData: {
    tipo_operacion: TipoOperacionPago;
    pedido_id?: number;
    compra_id?: number;
    tercero_id?: number;
    monto_original?: number;
    moneda?: 'USD' | 'VES';
  }) => void;
  isDarkMode?: boolean;
  storeName?: string;
}

export default function PosView({
  products,
  currentRate,
  onOrderCompleted,
  onOpenRates,
  isDarkMode = false,
  storeName = 'Tienda Express',
}: PosViewProps) {
  const { showToast } = useToast();
  const confirmAction = useConfirm();

  const [clients, setClients] = useState<Tercero[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [lastCompletedOrder, setLastCompletedOrder] = useState<CompletedOrderReceipt | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showClientSearchModal, setShowClientSearchModal] = useState(false);
  const [showQuickClientModal, setShowQuickClientModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showParkedModal, setShowParkedModal] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [catalogPage, setCatalogPage] = useState(1);
  const [activeZone, setActiveZone] = useState<'catalog' | 'cart'>('catalog');
  const [parkedSales, setParkedSales] = useState<ParkedSale[]>(() => loadParkedSales());
  const [cardSelectedPres, setCardSelectedPres] = useState<Record<number, number | null>>({});
  const [permitirStockNegativo, setPermitirStockNegativo] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isPosSoundEnabled());

  // Tipos y términos de pago
  const [tiposPago, setTiposPago] = useState<TipoPago[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);
  const [selectedCuentaBancariaId, setSelectedCuentaBancariaId] = useState<number | null>(null);
  const [condicionPago, setCondicionPago] = useState<CondicionPago>('CONTADO');
  const [registrarPago, setRegistrarPago] = useState<boolean>(true);
  const [selectedTipoPagoId, setSelectedTipoPagoId] = useState<number | null>(null);
  const [referenciaPago, setReferenciaPago] = useState('');
  const [montoAbono, setMontoAbono] = useState('');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState(() => getDefaultDueDate(15));

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const submittingOrderRef = useRef(false);

  const rateValue = currentRate ? Number(currentRate.tasa) : 0;

  const notify = useCallback(
    (n: { type: 'success' | 'error'; text: string }) => {
      if (n.type === 'error') playPosErrorTone();
      showToast(n.type, n.text);
    },
    [showToast]
  );

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      setPosSoundEnabled(next);
      return next;
    });
  }, []);

  const focusScanner = useCallback(() => {
    const el = searchInputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const {
    cart,
    totals,
    makeLineId,
    getCartBaseUnits,
    addToCart: addItemToCart,
    updateQuantity,
    setDirectQuantity,
    changeItemPresentation,
    removeFromCart,
    clearCart,
    replaceCart,
  } = usePosCart({
    permitirStockNegativo,
    rateValue,
    products,
    onNotify: notify,
  });

  const { totalUsd, totalLocal } = totals;

  const addToCart = useCallback(
    (product: Producto, presIdOverride?: number | null, qty = 1) => {
      const presId =
        presIdOverride !== undefined ? presIdOverride : (cardSelectedPres[product.id] ?? null);
      addItemToCart(product, presId, qty);
      playPosAddBeep();
    },
    [addItemToCart, cardSelectedPres]
  );

  const handleSelectCardPres = useCallback((productId: number, presId: number | null) => {
    setCardSelectedPres((prev) => ({ ...prev, [productId]: presId }));
  }, []);

  const posSelectedTp = useMemo(
    () => tiposPago.find((t) => t.id === selectedTipoPagoId) ?? null,
    [tiposPago, selectedTipoPagoId]
  );
  const posIsEfectivo = Boolean(posSelectedTp?.codigo?.startsWith('EFECTIVO'));
  const posTargetMoneda: 'USD' | 'VES' = posSelectedTp?.moneda === 'VES' ? 'VES' : 'USD';

  const posCuentasCompatibles = useMemo(
    () =>
      cuentasBancarias.filter((cb) => {
        const matchTipo = posIsEfectivo ? cb.banco_tipo === 'CAJA' : cb.banco_tipo === 'BANCO';
        const matchMoneda = cb.moneda === posTargetMoneda;
        return matchTipo && matchMoneda;
      }),
    [cuentasBancarias, posIsEfectivo, posTargetMoneda]
  );

  const effectiveCuentaBancariaId = useMemo(() => {
    if (posCuentasCompatibles.length === 0) return null;
    if (posCuentasCompatibles.some((c) => c.id === selectedCuentaBancariaId)) {
      return selectedCuentaBancariaId;
    }
    return posCuentasCompatibles[0].id;
  }, [posCuentasCompatibles, selectedCuentaBancariaId]);

  const handleSelectCondicionPago = useCallback((cond: CondicionPago) => {
    setCondicionPago(cond);
    setCheckoutError(null);
    if (cond === 'CONTADO') {
      setRegistrarPago(true);
      setMontoAbono('');
    } else {
      setRegistrarPago(false);
      setMontoRecibido('');
      const days =
        cond === 'CREDITO_7'
          ? 7
          : cond === 'CREDITO_30'
          ? 30
          : cond === 'CREDITO_45'
          ? 45
          : 15;
      setFechaVencimiento(getDefaultDueDate(days));
    }
  }, []);

  // Al cambiar de método de pago: limpiar monto recibido, referencia y abono (P1-5)
  const handleSelectTipoPago = useCallback((tpId: number) => {
    setSelectedTipoPagoId(tpId);
    setMontoRecibido('');
    setReferenciaPago('');
    setMontoAbono('');
    setCheckoutError(null);
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch('/api/terceros?tipo=CLIENTE&active=true');
      const data = await res.json();
      if (data.success && Array.isArray(data.terceros)) {
        setClients(data.terceros);
      }
    } catch (e) {
      console.error('Error fetching clients for POS:', e);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadInitial = async () => {
      try {
        const [tpRes, cbRes, terRes] = await Promise.all([
          fetch('/api/tipos-pago'),
          fetch('/api/cuentas-bancarias'),
          fetch('/api/terceros?tipo=CLIENTE&active=true'),
        ]);
        if (!tpRes.ok || !cbRes.ok || !terRes.ok) {
          throw new Error('No se pudieron cargar los catálogos operativos del POS.');
        }
        const [tpData, cbData, terData] = await Promise.all([
          tpRes.json(),
          cbRes.json(),
          terRes.json(),
        ]);
        if (!active) return;

        setInitialLoadError(null);
        if (tpData.success && Array.isArray(tpData.tiposPago)) {
          setTiposPago(tpData.tiposPago);
          if (tpData.tiposPago.length > 0) {
            setSelectedTipoPagoId((prev) => prev ?? tpData.tiposPago[0].id);
          }
        }
        if (cbData.success && Array.isArray(cbData.cuentas)) {
          setCuentasBancarias(cbData.cuentas);
        }
        if (terData.success && Array.isArray(terData.terceros)) {
          setClients(terData.terceros);
          const defaultClient = resolveDefaultClient(terData.terceros);
          if (defaultClient) {
            setSelectedClientId((prev) => prev ?? defaultClient.id);
          }
        }
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : 'Error cargando datos iniciales de POS.';
        console.error('Error cargando datos iniciales de POS:', e);
        setInitialLoadError(msg);
        showToast('error', msg);
      }
    };

    void loadInitial();
    return () => {
      active = false;
    };
  }, [reloadTick, showToast]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => focusScanner());
    return () => window.cancelAnimationFrame(raf);
  }, [focusScanner]);

  const filteredCount = useMemo(
    () => filterPosProducts(products, searchTerm).length,
    [products, searchTerm]
  );
  const totalCatalogPages = Math.max(1, Math.ceil(filteredCount / CATALOG_PAGE_SIZE));

  const persistParkedSales = useCallback((next: ParkedSale[]) => {
    setParkedSales(next);
    try {
      window.sessionStorage.setItem(PARKED_SALES_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? resolveDefaultClient(clients),
    [clients, selectedClientId]
  );

  const handleParkCurrentSale = useCallback(() => {
    if (cart.length === 0) return;
    const nowLabel = new Date().toLocaleTimeString('es-VE', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const entry: ParkedSale = {
      id: `park-${Date.now()}`,
      createdAt: nowLabel,
      clientId: selectedClient?.id ?? selectedClientId,
      clientLabel: selectedClient
        ? `${selectedClient.identificacion} — ${selectedClient.razon_social_nombre}`
        : 'Cliente Genérico',
      items: cart,
      totalUsd,
    };
    persistParkedSales([entry, ...parkedSales].slice(0, 15));
    clearCart();
    const defaultClient = resolveDefaultClient(clients);
    if (defaultClient) setSelectedClientId(defaultClient.id);
    showToast('info', 'Venta aparcada en espera [F9].');
    focusScanner();
  }, [
    cart,
    clearCart,
    clients,
    focusScanner,
    parkedSales,
    persistParkedSales,
    selectedClient,
    selectedClientId,
    showToast,
    totalUsd,
  ]);

  const handleRecallParkedSale = useCallback(
    (saleId: string) => {
      const target = parkedSales.find((s) => s.id === saleId);
      if (!target) return;
      replaceCart(target.items);
      if (target.clientId) setSelectedClientId(target.clientId);
      persistParkedSales(parkedSales.filter((s) => s.id !== saleId));
      showToast('success', 'Venta en espera recuperada.');
    },
    [parkedSales, persistParkedSales, replaceCart, showToast]
  );

  const handleDeleteParkedSale = useCallback(
    (saleId: string) => {
      persistParkedSales(parkedSales.filter((s) => s.id !== saleId));
      showToast('info', 'Venta en espera descartada.');
    },
    [parkedSales, persistParkedSales, showToast]
  );

  const handleRequestClearCart = useCallback(() => {
    if (cart.length === 0) return;
    void confirmAction({
      title: 'Vaciar carrito',
      message: `¿Deseas eliminar los ${cart.length} artículos del carrito actual?`,
      confirmLabel: 'Sí, vaciar',
      cancelLabel: 'Cancelar',
      destructive: true,
    }).then((accepted) => {
      if (accepted) {
        clearCart();
        showToast('info', 'Carrito vaciado.');
        focusScanner();
      }
    });
  }, [cart.length, clearCart, confirmAction, focusScanner, showToast]);

  const handleOpenCheckoutModal = useCallback(() => {
    if (cart.length === 0) {
      showToast('error', 'El carrito está vacío.');
      return;
    }
    if (!currentRate || rateValue <= 0) {
      showToast('error', 'Debes registrar la tasa de cambio del día antes de procesar ventas.');
      return;
    }
    setCheckoutError(null);
    setMontoAbono('');
    setMontoRecibido('');
    setShowCheckoutModal(true);
  }, [cart.length, currentRate, rateValue, showToast]);

  const handleProcessOrder = useCallback(async () => {
    if (submittingOrderRef.current) return;

    if (cart.length === 0) {
      setCheckoutError('El carrito está vacío.');
      return;
    }
    if (!currentRate || rateValue <= 0) {
      setCheckoutError('Debes registrar la tasa de cambio del día antes de procesar ventas.');
      return;
    }

    if (registrarPago) {
      if (posSelectedTp?.requiere_referencia && !referenciaPago.trim()) {
        setCheckoutError(
          `El método "${posSelectedTp.nombre}" requiere indicar número de referencia.`
        );
        return;
      }

      const maxAllowed = posTargetMoneda === 'VES' ? totalLocal : totalUsd;
      const abonoNum = parseFloat(montoAbono);

      if (condicionPago !== 'CONTADO') {
        if (!montoAbono.trim() || !Number.isFinite(abonoNum) || abonoNum <= 0) {
          setCheckoutError(
            'En ventas a crédito con abono inicial, debes ingresar un monto de abono mayor a 0.'
          );
          return;
        }
        if (abonoNum >= maxAllowed - 0.005) {
          setCheckoutError(
            `El abono inicial (${abonoNum.toFixed(2)}) debe ser menor al total (${maxAllowed.toFixed(2)} ${posTargetMoneda}). Para pago completo usa Contado.`
          );
          return;
        }
      } else if (posIsEfectivo) {
        const recNum = parseFloat(montoRecibido) || 0;
        if (recNum > 0 && recNum < maxAllowed - 0.005) {
          setCheckoutError('El monto recibido es menor al total por cobrar.');
          return;
        }
      }
    }

    submittingOrderRef.current = true;
    setLoading(true);
    setCheckoutError(null);

    try {
      const itemsPayload = cart.map((item) => ({
        producto_id: item.producto.id,
        cantidad: item.cantidad,
        precio_unitario_usd: item.precio_unitario_usd,
        presentacion_id: item.presentacion_id,
      }));

      const parsedAbono =
        registrarPago &&
        montoAbono &&
        Number.isFinite(parseFloat(montoAbono)) &&
        parseFloat(montoAbono) > 0
          ? parseFloat(montoAbono)
          : null;

      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tercero_id: selectedClient?.id ?? selectedClientId ?? undefined,
          cliente_nombre: selectedClient?.razon_social_nombre || 'Cliente Genérico',
          tasa_cambio_aplicada: rateValue,
          permitir_stock_negativo: permitirStockNegativo,
          condicion_pago: condicionPago,
          tipo_pago_id: registrarPago ? selectedTipoPagoId : null,
          referencia_pago: registrarPago && referenciaPago.trim() ? referenciaPago.trim() : undefined,
          fecha_vencimiento: condicionPago !== 'CONTADO' ? fechaVencimiento : undefined,
          cuenta_bancaria_id: registrarPago ? effectiveCuentaBancariaId : null,
          registrar_pago: registrarPago,
          monto_pago: parsedAbono,
          items: itemsPayload,
        }),
      });

      const data = await res.json();

      if (data.success) {
        const recNum = parseFloat(montoRecibido) || 0;
        const changeSummary =
          condicionPago === 'CONTADO' && registrarPago && posIsEfectivo && recNum > 0
            ? calculateDualChange({
                totalUsd,
                totalLocal,
                rateValue,
                receivedAmount: recNum,
                currency: posTargetMoneda,
              })
            : null;

        setShowCheckoutModal(false);
        setLastCompletedOrder({
          ...data.order,
          condicion_pago: condicionPago,
          tipo_pago_nombre: registrarPago
            ? posSelectedTp?.nombre || null
            : 'Crédito Pendiente',
          referencia_pago: registrarPago && referenciaPago.trim() ? referenciaPago.trim() : null,
          fecha_vencimiento: condicionPago !== 'CONTADO' ? fechaVencimiento : null,
          cliente_nombre: selectedClient?.razon_social_nombre || 'Cliente Genérico',
          cliente_identificacion: selectedClient?.identificacion || 'V-00000000',
          vuelto_usd: changeSummary && !changeSummary.isShort ? changeSummary.changeUsd : 0,
          vuelto_local: changeSummary && !changeSummary.isShort ? changeSummary.changeLocal : 0,
          recibido_monto: recNum > 0 ? recNum : undefined,
          recibido_moneda: recNum > 0 ? posTargetMoneda : undefined,
          lineas: cart.map((c) => {
            const rawTax = c.producto.impuesto_porcentaje;
            const taxPct = rawTax !== undefined && rawTax !== null ? Number(rawTax) : 16.0;
            return {
              lineId: c.id,
              nombre: c.presentacion_id
                ? `${c.producto.nombre} (${c.presentacion_nombre})`
                : c.producto.nombre,
              presentacion_nombre: c.presentacion_nombre,
              cantidad: c.cantidad,
              precio: c.precio_unitario_usd,
              subtotal: round2(c.precio_unitario_usd * c.cantidad),
              taxPct,
            };
          }),
        });

        clearCart();
        const defaultClient = resolveDefaultClient(clients);
        if (defaultClient) setSelectedClientId(defaultClient.id);
        setCondicionPago('CONTADO');
        setRegistrarPago(true);
        setReferenciaPago('');
        setMontoAbono('');
        setMontoRecibido('');
        setPermitirStockNegativo(false);
        setFechaVencimiento(getDefaultDueDate(15));
        playPosSuccessChime();
        showToast('success', `¡Venta #${data.order.id} registrada correctamente!`);
        onOrderCompleted();
      } else {
        playPosErrorTone();
        setCheckoutError(data.message || 'Error al guardar la venta');
        showToast('error', data.message || 'Error al guardar la venta');
      }
    } catch {
      playPosErrorTone();
      setCheckoutError('Error de conexión al procesar el pedido. El carrito se conservó intacto.');
      showToast('error', 'Error de conexión al procesar el pedido');
    } finally {
      submittingOrderRef.current = false;
      setLoading(false);
    }
  }, [
    cart,
    clearCart,
    clients,
    condicionPago,
    currentRate,
    effectiveCuentaBancariaId,
    fechaVencimiento,
    montoAbono,
    montoRecibido,
    onOrderCompleted,
    permitirStockNegativo,
    posIsEfectivo,
    posSelectedTp,
    posTargetMoneda,
    rateValue,
    referenciaPago,
    registrarPago,
    selectedClient,
    selectedClientId,
    selectedTipoPagoId,
    showToast,
    totalLocal,
    totalUsd,
  ]);

  const handleQuickClientCreated = useCallback(
    async (client: Tercero) => {
      await loadClients();
      setSelectedClientId(client.id);
      showToast('success', `Cliente "${client.razon_social_nombre}" registrado y seleccionado.`);
    },
    [loadClients, showToast]
  );

  const hasOpenModal =
    showCheckoutModal ||
    showClientSearchModal ||
    showQuickClientModal ||
    showShortcutsModal ||
    showParkedModal ||
    Boolean(lastCompletedOrder);

  const handlePosKeyAction = useCallback(
    (action: PosKeyAction) => {
      switch (action) {
        case 'TOGGLE_HELP':
          setShowShortcutsModal((prev) => !prev);
          break;
        case 'FOCUS_SEARCH':
          setActiveZone('catalog');
          focusScanner();
          break;
        case 'FOCUS_CLIENT':
          setShowClientSearchModal(true);
          break;
        case 'OPEN_QUICK_CLIENT':
          setShowQuickClientModal(true);
          break;
        case 'TOGGLE_ZONE':
          setActiveZone((prev) => {
            const next = prev === 'catalog' ? 'cart' : 'catalog';
            if (next === 'catalog') focusScanner();
            return next;
          });
          break;
        case 'CATALOG_PREV_PAGE':
          setCatalogPage((p) => Math.max(1, p - 1));
          break;
        case 'CATALOG_NEXT_PAGE':
          setCatalogPage((p) => Math.min(totalCatalogPages, p + 1));
          break;
        case 'OPEN_PARKED_ORDERS':
          setShowParkedModal(true);
          break;
        case 'FOCUS_PAYMENT':
        case 'OPEN_CHECKOUT':
          handleOpenCheckoutModal();
          break;
        case 'CONFIRM_ACTIVE':
          if (showCheckoutModal && !lastCompletedOrder) {
            void handleProcessOrder();
          }
          break;
        case 'CLEAR_CART':
          handleRequestClearCart();
          break;
        case 'ESCAPE':
          if (searchTerm) {
            setSearchTerm('');
            setCatalogPage(1);
          }
          setActiveZone('catalog');
          focusScanner();
          break;
        default:
          break;
      }
    },
    [
      focusScanner,
      handleOpenCheckoutModal,
      handleProcessOrder,
      handleRequestClearCart,
      lastCompletedOrder,
      searchTerm,
      showCheckoutModal,
      totalCatalogPages,
    ]
  );

  usePosKeyboard({
    enabled: true,
    hasOpenModal,
    onAction: handlePosKeyAction,
  });

  const activePaymentLabel = useMemo(() => {
    if (condicionPago !== 'CONTADO' && !registrarPago) {
      return 'Sin abono inicial';
    }
    return posSelectedTp?.nombre || 'Efectivo';
  }, [condicionPago, posSelectedTp, registrarPago]);

  return (
    <div className="space-y-3">
      {/* Barra Operativa POS */}
      <PosTopBar
        rateValue={rateValue}
        onOpenRates={onOpenRates}
        clients={clients}
        selectedClientId={selectedClient?.id ?? selectedClientId}
        onOpenClientSearch={() => setShowClientSearchModal(true)}
        onOpenQuickClient={() => setShowQuickClientModal(true)}
        permitirStockNegativo={permitirStockNegativo}
        onToggleStockNegativo={setPermitirStockNegativo}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenShortcuts={() => setShowShortcutsModal(true)}
        initialLoadError={initialLoadError}
        onRetryInitialLoad={() => setReloadTick((t) => t + 1)}
        isDarkMode={isDarkMode}
      />

      {/* Workspace Lado a Lado desde md (768px+): Catálogo 7 cols | Ticket 5 cols */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-stretch md:h-[calc(100dvh-11.5rem)] md:min-h-[500px]">
        <div className="md:col-span-7 min-h-0 flex flex-col">
          <PosCatalogPanel
            products={products}
            cart={cart}
            rateValue={rateValue}
            permitirStockNegativo={permitirStockNegativo}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            searchInputRef={searchInputRef}
            cardSelectedPres={cardSelectedPres}
            onSelectCardPres={handleSelectCardPres}
            getCartBaseUnits={getCartBaseUnits}
            makeLineId={makeLineId}
            onAddToCart={addToCart}
            page={catalogPage}
            onPageChange={setCatalogPage}
            isActiveZone={activeZone === 'catalog'}
            onFocusZone={() => setActiveZone('catalog')}
            isDarkMode={isDarkMode}
          />
        </div>

        <div className="md:col-span-5 min-h-0 flex flex-col">
          <PosCartPanel
            cart={cart}
            totals={totals}
            rateValue={rateValue}
            condicionPago={condicionPago}
            activePaymentLabel={activePaymentLabel}
            parkedCount={parkedSales.length}
            isActiveZone={activeZone === 'cart'}
            onFocusZone={() => setActiveZone('cart')}
            onUpdateQuantity={updateQuantity}
            onSetDirectQuantity={setDirectQuantity}
            onChangePresentation={changeItemPresentation}
            onRemoveItem={removeFromCart}
            onRequestClearCart={handleRequestClearCart}
            onOpenParkedOrders={() => setShowParkedModal(true)}
            onParkCurrentSale={handleParkCurrentSale}
            onOpenCheckout={handleOpenCheckoutModal}
            isDarkMode={isDarkMode}
          />
        </div>
      </div>

      {/* Diálogo de Búsqueda de Clientes [F3 / Alt+C] */}
      <PosClientSearchModal
        open={showClientSearchModal}
        onClose={() => setShowClientSearchModal(false)}
        onAfterClose={focusScanner}
        clients={clients}
        selectedClientId={selectedClient?.id ?? selectedClientId}
        onSelectClient={(client) => {
          setSelectedClientId(client.id);
          showToast('info', `Cliente seleccionado: ${client.razon_social_nombre}`);
        }}
        onOpenQuickClient={() => setShowQuickClientModal(true)}
        isDarkMode={isDarkMode}
      />

      {/* Quick Client Modal [Alt+N] */}
      <PosQuickClientModal
        open={showQuickClientModal}
        onClose={() => setShowQuickClientModal(false)}
        onAfterClose={focusScanner}
        onClientCreated={handleQuickClientCreated}
        isDarkMode={isDarkMode}
      />

      {/* Keyboard Shortcuts Modal [F1 / Alt+H] */}
      <PosShortcutsModal
        open={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
        onAfterClose={focusScanner}
        isDarkMode={isDarkMode}
      />

      {/* Ventas en Espera Modal [F9] */}
      <PosParkedOrdersModal
        open={showParkedModal}
        onClose={() => setShowParkedModal(false)}
        onAfterClose={focusScanner}
        parkedSales={parkedSales}
        onRecallSale={handleRecallParkedSale}
        onDeleteSale={handleDeleteParkedSale}
        isDarkMode={isDarkMode}
      />

      {/* Modal de Cobro Split Layout 2 Columnas [F8] */}
      <PosCheckoutModal
        open={showCheckoutModal}
        onClose={() => {
          setShowCheckoutModal(false);
          setCheckoutError(null);
        }}
        onAfterClose={focusScanner}
        cart={cart}
        totals={totals}
        rateValue={rateValue}
        selectedClient={selectedClient}
        condicionPago={condicionPago}
        onSelectCondicionPago={handleSelectCondicionPago}
        fechaVencimiento={fechaVencimiento}
        onFechaVencimientoChange={setFechaVencimiento}
        registrarPago={registrarPago}
        onRegistrarPagoChange={(next) => {
          setRegistrarPago(next);
          setCheckoutError(null);
        }}
        tiposPago={tiposPago}
        selectedTipoPagoId={selectedTipoPagoId}
        onSelectTipoPago={handleSelectTipoPago}
        cuentasCompatibles={posCuentasCompatibles}
        effectiveCuentaBancariaId={effectiveCuentaBancariaId}
        onSelectCuentaBancaria={setSelectedCuentaBancariaId}
        referenciaPago={referenciaPago}
        onReferenciaPagoChange={setReferenciaPago}
        montoAbono={montoAbono}
        onMontoAbonoChange={setMontoAbono}
        montoRecibido={montoRecibido}
        onMontoRecibidoChange={setMontoRecibido}
        checkoutError={checkoutError}
        loading={loading}
        onConfirmOrder={() => void handleProcessOrder()}
        isDarkMode={isDarkMode}
      />

      {/* Modal de Recibo + Ticket Térmico 80mm */}
      <PosReceiptModal
        order={lastCompletedOrder}
        storeName={storeName}
        onClose={() => setLastCompletedOrder(null)}
        onAfterClose={focusScanner}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}
