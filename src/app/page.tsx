'use client';

import { useState, useEffect, useCallback, type ComponentProps } from 'react';
import {
  ShoppingCart,
  RefreshCw,
  Store,
  Sun,
  Moon,
  Truck,
  LayoutGrid,
  QrCode,
  BarChart3,
  ShieldAlert,
  LogOut,
  Tag,
} from 'lucide-react';
import MainMenuView from '@/components/MainMenuView';
import DashboardView from '@/components/DashboardView';
import PosView from '@/components/PosView';
import ProductsView from '@/components/ProductsView';
import RatesView from '@/components/RatesView';
import OrdersView from '@/components/OrdersView';
import ComprasView from '@/components/ComprasView';
import TercerosView from '@/components/TercerosView';
import ImpuestosView from '@/components/ImpuestosView';
import ReportesView from '@/components/ReportesView';
import UsuariosView from '@/components/UsuariosView';
import PriceListView from '@/components/PriceListView';
import ImportExcelView from '@/components/ImportExcelView';
import PagosView from '@/components/PagosView';
import BancosCuentasView from '@/components/BancosCuentasView';
import LoginModal from '@/components/LoginModal';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import DatabaseModal from '@/components/DatabaseModal';
import QrModal from '@/components/QrModal';
import MantenimientoModal from '@/components/MantenimientoModal';
import { Producto, Tasa, DashboardData, Usuario } from '@/types';
import { hasTabPermission } from '@/lib/permissions';

type ActiveTab =
  | 'menu'
  | 'dashboard'
  | 'pos'
  | 'price_list'
  | 'orders'
  | 'compras'
  | 'pagos'
  | 'products'
  | 'import_excel'
  | 'terceros'
  | 'bancos'
  | 'impuestos'
  | 'rates'
  | 'reports'
  | 'users';

type PagosInitialAction = ComponentProps<typeof PagosView>['initialAction'];

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('menu');
  const [reportSubTab, setReportSubTab] = useState<'ventas' | 'rentabilidad' | 'inventario'>('ventas');
  const [showDbModal, setShowDbModal] = useState(false);
  const [showMantenimientoModal, setShowMantenimientoModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [dbConnected, setDbConnected] = useState(true);
  const [pagosInitialAction, setPagosInitialAction] = useState<PagosInitialAction>(null);

  // Auth state
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Theme state: defaults to 'light'
  const [isDarkMode, setIsDarkMode] = useState(false);

  // App data state
  const [products, setProducts] = useState<Producto[]>([]);
  const [currentRate, setCurrentRate] = useState<Tasa | null>(null);
  const [historyRates, setHistoryRates] = useState<Tasa[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const resetClientSession = useCallback(() => {
    setCurrentUser(null);
    setMustChangePassword(false);
    setProducts([]);
    setCurrentRate(null);
    setHistoryRates([]);
    setDashboardData(null);
    setPagosInitialAction(null);
    setShowDbModal(false);
    setShowMantenimientoModal(false);
    setShowQrModal(false);
    setReportSubTab('ventas');
    setActiveTab('menu');
    setShowLoginModal(true);
  }, []);

  // Load theme preference and verify server session via HttpOnly cookie on mount
  useEffect(() => {
    let active = true;

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }

    const verifySession = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'same-origin',
        });
        if (!active) return;

        if (res.ok) {
          const data = await res.json();
          if (!active) return;

          if (data.success && data.user) {
            setCurrentUser(data.user);
            setMustChangePassword(Boolean(data.mustChangePassword));
            setShowLoginModal(false);
            return;
          }
        }

        setCurrentUser(null);
        setMustChangePassword(false);
        setShowLoginModal(true);
      } catch {
        if (!active) return;
        setCurrentUser(null);
        setMustChangePassword(false);
        setShowLoginModal(true);
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    };

    verifySession();

    return () => {
      active = false;
    };
  }, []);

  const handleLoginSuccess = (user: Usuario, requirePasswordChange?: boolean) => {
    setCurrentUser(user);
    setShowLoginModal(false);
    setMustChangePassword(Boolean(requirePasswordChange));
  };

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // Limpiar siempre la sesión local aunque falle la comunicación
    } finally {
      resetClientSession();
    }
  }, [resetClientSession]);

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // Fetch initial data only when authenticated
  const fetchData = useCallback(async () => {
    if (!currentUser) return;

    setIsRefreshing(true);

    const requestJson = async (url: string) => {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (res.status === 401) {
        return { status: 'unauthorized' as const };
      }
      if (res.status === 403) {
        return { status: 'forbidden' as const };
      }
      if (res.status >= 500) {
        return { status: 'server_error' as const };
      }
      try {
        const data = await res.json();
        return { status: 'ok' as const, data };
      } catch {
        return { status: 'error' as const };
      }
    };

    try {
      let hasDbSuccess = false;
      let hasDbFailure = false;

      // 1. Fetch Products (only if user role has access to modules that consume products)
      const canFetchProducts =
        hasTabPermission(currentUser, 'pos') ||
        hasTabPermission(currentUser, 'products') ||
        hasTabPermission(currentUser, 'price_list') ||
        hasTabPermission(currentUser, 'compras');

      if (canFetchProducts) {
        const prodOutcome = await requestJson('/api/productos');
        if (prodOutcome.status === 'unauthorized') {
          resetClientSession();
          return;
        }
        if (prodOutcome.status === 'forbidden') {
          setProducts([]);
        } else if (prodOutcome.status === 'server_error' || prodOutcome.status === 'error') {
          hasDbFailure = true;
        } else if (prodOutcome.data?.success) {
          setProducts(prodOutcome.data.products || []);
          hasDbSuccess = true;
        } else {
          hasDbFailure = true;
        }
      } else {
        setProducts([]);
      }

      // 2. Fetch Current Rate
      const rateOutcome = await requestJson('/api/tasa');
      if (rateOutcome.status === 'unauthorized') {
        resetClientSession();
        return;
      }
      if (rateOutcome.status === 'server_error' || rateOutcome.status === 'error') {
        hasDbFailure = true;
      } else if (rateOutcome.status === 'ok') {
        if (rateOutcome.data?.success) {
          setCurrentRate(rateOutcome.data.rate || null);
          hasDbSuccess = true;
        } else {
          hasDbFailure = true;
        }
      }

      // 3. Fetch Rate History
      const historyOutcome = await requestJson('/api/tasa?all=true');
      if (historyOutcome.status === 'unauthorized') {
        resetClientSession();
        return;
      }
      if (historyOutcome.status === 'server_error' || historyOutcome.status === 'error') {
        hasDbFailure = true;
      } else if (historyOutcome.status === 'ok' && historyOutcome.data?.success) {
        setHistoryRates(historyOutcome.data.rates || []);
      }

      // 4. Fetch Dashboard Stats
      const dashOutcome = await requestJson('/api/dashboard');
      if (dashOutcome.status === 'unauthorized') {
        resetClientSession();
        return;
      }
      if (dashOutcome.status === 'server_error' || dashOutcome.status === 'error') {
        hasDbFailure = true;
      } else if (dashOutcome.status === 'ok') {
        if (dashOutcome.data?.success) {
          setDashboardData(dashOutcome.data.data);
          hasDbSuccess = true;
        } else {
          hasDbFailure = true;
        }
      }

      if (hasDbFailure) {
        setDbConnected(false);
      } else if (hasDbSuccess) {
        setDbConnected(true);
      }
    } catch (e) {
      console.error('Error fetching application data:', e);
      setDbConnected(false);
    } finally {
      setIsRefreshing(false);
    }
  }, [currentUser, resetClientSession]);

  useEffect(() => {
    if (currentUser && !mustChangePassword) {
      fetchData();
    }
  }, [currentUser, mustChangePassword, fetchData]);

  const navItems = [
    { id: 'menu', label: 'Inicio', icon: LayoutGrid },
    { id: 'pos', label: 'Punto de Venta', icon: ShoppingCart },
    { id: 'price_list', label: 'Lista de Precios', icon: Tag },
    { id: 'compras', label: 'Compras', icon: Truck },
    { id: 'reports', label: 'Reportes', icon: BarChart3 },
  ] as const;

  const visibleNavItems = navItems.filter((item) => hasTabPermission(currentUser, item.id));

  const handleSelectNavTab = (tabId: (typeof navItems)[number]['id']) => {
    if (!hasTabPermission(currentUser, tabId)) return;
    if (tabId === 'reports') {
      setReportSubTab(hasTabPermission(currentUser, 'reports', 'ventas') ? 'ventas' : 'rentabilidad');
    }
    setActiveTab(tabId);
  };

  const canViewCurrentTab =
    activeTab === 'menu'
      ? Boolean(currentUser)
      : hasTabPermission(
          currentUser,
          activeTab,
          activeTab === 'reports' ? reportSubTab : undefined
        );

  const canOpenRates = hasTabPermission(currentUser, 'rates');
  const canOpenUsers = hasTabPermission(currentUser, 'users');
  const canOpenDbModal = hasTabPermission(currentUser, 'db_config');
  const canOpenMaintenanceModal = hasTabPermission(currentUser, 'maintenance');

  if (authLoading) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center p-4 font-sans transition-colors duration-200 ${
          isDarkMode
            ? 'bg-slate-950 text-slate-100'
            : 'bg-slate-50 text-slate-900'
        }`}
      >
        <div
          className={`p-8 rounded-3xl border shadow-xl flex flex-col items-center gap-4 text-center max-w-sm w-full ${
            isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
          </div>
          <div>
            <h2 className="text-base font-bold">Verificando sesión...</h2>
            <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Validando acceso autorizado con el servidor
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${
        isDarkMode
          ? 'bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white'
          : 'bg-slate-50 text-slate-900 selection:bg-indigo-500 selection:text-white'
      }`}
    >
      {/* Top Navigation Bar */}
      <header
        className={`print:hidden sticky top-0 z-40 backdrop-blur-xl border-b transition-colors ${
          isDarkMode
            ? 'bg-slate-950/80 border-slate-800/80'
            : 'bg-white/90 border-slate-200/90 shadow-sm'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          {/* Logo & Store Brand */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (!currentUser) return;
                if (activeTab === 'menu') {
                  setShowQrModal(true);
                } else {
                  setActiveTab('menu');
                }
              }}
              title={
                !currentUser
                  ? 'Tienda Express POS'
                  : activeTab === 'menu'
                    ? 'Ver Código QR para Móvil'
                    : 'Ir al Menú Principal'
              }
              className="flex items-center gap-2.5 text-left group p-1 -ml-1 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-900/60 transition cursor-pointer shrink-0"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-600/25 group-hover:scale-105 transition">
                <Store className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1
                  className={`font-bold text-sm tracking-tight flex items-center gap-1.5 ${
                    isDarkMode ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Tienda Express{' '}
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 dark:bg-indigo-500/20 border border-indigo-500/20">
                    POS
                  </span>
                </h1>
                <p className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  ERP Express Multimoneda
                </p>
              </div>
            </button>

            {/* Direct QR trigger button right next to the brand */}
            {currentUser && (
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                title="Abrir Código QR para Móvil"
                className={`p-1.5 rounded-xl border transition flex items-center gap-1 text-xs font-semibold ${
                  isDarkMode
                    ? 'bg-indigo-950/40 border-indigo-500/30 text-indigo-300 hover:bg-indigo-900/60'
                    : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 shadow-sm'
                }`}
              >
                <QrCode className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="hidden lg:inline text-[11px]">QR Móvil</span>
              </button>
            )}
          </div>

          {/* Navigation Tabs (Desktop & Tablet) */}
          {visibleNavItems.length > 0 && (
            <nav
              className={`hidden sm:flex items-center p-1 rounded-2xl border transition-colors ${
                isDarkMode
                  ? 'bg-slate-900/90 border-slate-800'
                  : 'bg-slate-100/90 border-slate-200'
              }`}
            >
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectNavTab(item.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                        : isDarkMode
                          ? 'text-slate-400 hover:text-white'
                          : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Controls: Theme Toggle, Rate Badge, Refresh, User */}
          <div className="flex items-center gap-2 shrink-0">
            {currentUser && !dbConnected && (
              <span
                title="Error de conexión con la base de datos"
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-semibold bg-rose-500/10 border-rose-500/30 text-rose-500"
              >
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Sin BD
              </span>
            )}

            {/* Quick Rate Badge */}
            {currentUser && currentRate && (
              <div
                onClick={canOpenRates ? () => setActiveTab('rates') : undefined}
                className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition ${
                  canOpenRates ? 'cursor-pointer' : 'cursor-default'
                } ${
                  isDarkMode
                    ? `bg-slate-900 border-slate-800 ${canOpenRates ? 'hover:border-slate-700' : ''}`
                    : `bg-white border-slate-200 shadow-sm ${canOpenRates ? 'hover:border-slate-300' : ''}`
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Tasa:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {Number(currentRate.tasa).toFixed(4)}
                </span>
              </div>
            )}

            {/* Light / Dark Mode Toggle */}
            <button
              onClick={toggleTheme}
              title={isDarkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className={`p-2 rounded-xl border transition flex items-center justify-center ${
                isDarkMode
                  ? 'bg-slate-900 border-slate-800 text-amber-300 hover:text-amber-200 hover:bg-slate-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:text-indigo-600 hover:bg-slate-100 shadow-sm'
              }`}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Refresh Button */}
            {currentUser && (
              <button
                onClick={() => fetchData()}
                disabled={isRefreshing}
                title="Refrescar Datos"
                className={`p-2 rounded-xl border transition disabled:opacity-50 ${
                  isDarkMode
                    ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-500' : ''}`} />
              </button>
            )}

            {/* Usuario Actual & Cerrar Sesión */}
            {currentUser ? (
              <div className="flex items-center gap-1 pl-1">
                <button
                  type="button"
                  onClick={() => {
                    if (canOpenUsers) {
                      setActiveTab('users');
                    }
                  }}
                  title={`Usuario: ${currentUser.nombre_completo} (${currentUser.rol_nombre})`}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
                    canOpenUsers ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    isDarkMode
                      ? 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white flex items-center justify-center text-[10px] font-bold">
                    {currentUser.username.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="hidden xl:inline max-w-[100px] truncate">
                    {currentUser.nombre_completo.split(' ')[0]}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  title="Cerrar Sesión"
                  className={`p-2 rounded-xl border transition text-rose-500 hover:text-rose-600 ${
                    isDarkMode
                      ? 'bg-slate-900 border-slate-800 hover:bg-rose-950/40'
                      : 'bg-white border-slate-200 hover:bg-rose-50 shadow-sm'
                  }`}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowLoginModal(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-md shadow-indigo-600/25 hover:bg-indigo-500 transition"
              >
                Iniciar Sesión
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        {visibleNavItems.length > 0 && (
          <div
            className={`sm:hidden border-t px-3 py-2 flex items-center justify-around gap-2 transition-colors ${
              isDarkMode
                ? 'bg-slate-950/90 border-slate-800'
                : 'bg-slate-50/90 border-slate-200 shadow-inner'
            }`}
          >
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectNavTab(item.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : isDarkMode
                        ? 'bg-slate-900 text-slate-400 border border-slate-800'
                        : 'bg-white text-slate-600 border border-slate-200 shadow-sm'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {currentUser && activeTab !== 'menu' && (
          <div className="mb-5 flex items-center justify-between">
            <button
              onClick={() => setActiveTab('menu')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition shadow-sm ${
                isDarkMode
                  ? 'bg-slate-900/90 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-850'
                  : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-indigo-500" />
              ← Menú Principal
            </button>
          </div>
        )}

        {!currentUser && (
          <div
            className={`max-w-md mx-auto my-14 p-8 rounded-3xl border text-center space-y-4 shadow-sm ${
              isDarkMode
                ? 'bg-slate-900/70 border-slate-800 text-slate-200'
                : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold">Acceso restringido</h2>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Inicia sesión con un usuario autorizado para acceder al sistema.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition cursor-pointer"
            >
              Iniciar Sesión
            </button>
          </div>
        )}

        {currentUser && activeTab !== 'menu' && !canViewCurrentTab && (
          <div
            className={`max-w-lg mx-auto my-12 p-8 rounded-3xl border text-center space-y-4 shadow-sm ${
              isDarkMode
                ? 'bg-slate-900/70 border-slate-800 text-slate-200'
                : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold">Acceso restringido</h2>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                No tienes permisos para ver este módulo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('menu')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition cursor-pointer"
            >
              <LayoutGrid className="w-4 h-4" />
              Volver al Menú Principal
            </button>
          </div>
        )}

        {currentUser && activeTab === 'menu' && (
          <MainMenuView
            onNavigate={(tab: ActiveTab, subTab?: 'ventas' | 'rentabilidad' | 'inventario') => {
              if (!hasTabPermission(currentUser, tab, subTab)) return;
              setActiveTab(tab);
              if (subTab) setReportSubTab(subTab);
            }}
            onOpenDbModal={() => {
              if (canOpenDbModal) {
                setShowDbModal(true);
              }
            }}
            onOpenMaintenanceModal={() => {
              if (canOpenMaintenanceModal) {
                setShowMantenimientoModal(true);
              }
            }}
            currentRate={currentRate}
            dashboardData={dashboardData}
            productsCount={products.length}
            isDarkMode={isDarkMode}
            currentUser={currentUser}
          />
        )}

        {currentUser && activeTab === 'pos' && hasTabPermission(currentUser, 'pos') && (
          <PosView
            products={products}
            currentRate={currentRate}
            onOrderCompleted={fetchData}
            onOpenRates={() => {
              if (canOpenRates) {
                setActiveTab('rates');
              }
            }}
            onNavigatePagos={
              hasTabPermission(currentUser, 'pagos')
                ? (actionData) => {
                    setPagosInitialAction(actionData);
                    setActiveTab('pagos');
                  }
                : undefined
            }
            isDarkMode={isDarkMode}
          />
        )}

        {currentUser &&
          activeTab === 'price_list' &&
          hasTabPermission(currentUser, 'price_list') && (
            <PriceListView
              products={products}
              currentRate={currentRate}
              isDarkMode={isDarkMode}
            />
          )}

        {currentUser && activeTab === 'orders' && hasTabPermission(currentUser, 'orders') && (
          <OrdersView isDarkMode={isDarkMode} onRefreshProducts={fetchData} />
        )}

        {currentUser && activeTab === 'compras' && hasTabPermission(currentUser, 'compras') && (
          <ComprasView
            products={products}
            currentRate={currentRate}
            onRefreshProducts={fetchData}
            onNavigatePagos={
              hasTabPermission(currentUser, 'pagos')
                ? (actionData) => {
                    setPagosInitialAction(actionData);
                    setActiveTab('pagos');
                  }
                : undefined
            }
            isDarkMode={isDarkMode}
          />
        )}

        {currentUser && activeTab === 'pagos' && hasTabPermission(currentUser, 'pagos') && (
          <PagosView isDarkMode={isDarkMode} initialAction={pagosInitialAction} />
        )}

        {currentUser && activeTab === 'products' && hasTabPermission(currentUser, 'products') && (
          <ProductsView
            products={products}
            onRefresh={fetchData}
            onNavigateImportExcel={
              hasTabPermission(currentUser, 'import_excel')
                ? () => setActiveTab('import_excel')
                : undefined
            }
            isDarkMode={isDarkMode}
          />
        )}

        {currentUser &&
          activeTab === 'import_excel' &&
          hasTabPermission(currentUser, 'import_excel') && (
            <ImportExcelView onImportCompleted={fetchData} isDarkMode={isDarkMode} />
          )}

        {currentUser && activeTab === 'terceros' && hasTabPermission(currentUser, 'terceros') && (
          <TercerosView isDarkMode={isDarkMode} />
        )}

        {currentUser && activeTab === 'bancos' && hasTabPermission(currentUser, 'bancos') && (
          <BancosCuentasView isDarkMode={isDarkMode} />
        )}

        {currentUser && activeTab === 'impuestos' && hasTabPermission(currentUser, 'impuestos') && (
          <ImpuestosView isDarkMode={isDarkMode} onRefresh={fetchData} />
        )}

        {currentUser && activeTab === 'dashboard' && hasTabPermission(currentUser, 'dashboard') && (
          <DashboardView
            data={dashboardData}
            onNavigatePos={
              hasTabPermission(currentUser, 'pos') ? () => setActiveTab('pos') : undefined
            }
            onNavigateRates={
              hasTabPermission(currentUser, 'rates') ? () => setActiveTab('rates') : undefined
            }
            onNavigateCompras={
              hasTabPermission(currentUser, 'compras') ? () => setActiveTab('compras') : undefined
            }
            onNavigateProducts={
              hasTabPermission(currentUser, 'products') ? () => setActiveTab('products') : undefined
            }
            isDarkMode={isDarkMode}
          />
        )}

        {currentUser && activeTab === 'rates' && hasTabPermission(currentUser, 'rates') && (
          <RatesView
            currentRate={currentRate}
            historyRates={historyRates}
            onRefresh={fetchData}
            isDarkMode={isDarkMode}
          />
        )}

        {currentUser &&
          activeTab === 'reports' &&
          hasTabPermission(currentUser, 'reports', reportSubTab) && (
            <ReportesView
              currentRate={currentRate}
              initialTab={reportSubTab}
              isDarkMode={isDarkMode}
            />
          )}

        {currentUser && activeTab === 'users' && hasTabPermission(currentUser, 'users') && (
          <UsuariosView isDarkMode={isDarkMode} currentUser={currentUser} />
        )}
      </main>

      {/* Footer */}
      <footer
        className={`border-t py-4 text-center text-xs transition-colors ${
          isDarkMode
            ? 'border-slate-800/80 bg-slate-950 text-slate-500'
            : 'border-slate-200 bg-white text-slate-400 shadow-inner'
        }`}
      >
        Tienda Express &bull; POS, Compras, Inventario, Terceros e Impuestos &bull; PostgreSQL
      </footer>

      {/* Database Modal */}
      <DatabaseModal
        isOpen={showDbModal && canOpenDbModal}
        onClose={() => setShowDbModal(false)}
        onConnected={fetchData}
        isDarkMode={isDarkMode}
      />

      {/* QR Code Modal para Móvil */}
      <QrModal
        isOpen={showQrModal && Boolean(currentUser)}
        onClose={() => setShowQrModal(false)}
        isDarkMode={isDarkMode}
      />

      {/* Modal de Mantenimiento / Sistemas */}
      <MantenimientoModal
        isOpen={showMantenimientoModal && canOpenMaintenanceModal}
        onClose={() => setShowMantenimientoModal(false)}
        onCompleted={fetchData}
        isDarkMode={isDarkMode}
      />

      {/* Modal de Inicio de Sesión */}
      <LoginModal
        isOpen={showLoginModal}
        onLoginSuccess={handleLoginSuccess}
        isDarkMode={isDarkMode}
      />

      {/* Modal Obligatorio de Cambio de Contraseña */}
      <ChangePasswordModal
        isOpen={Boolean(currentUser && mustChangePassword)}
        onPasswordChanged={() => setMustChangePassword(false)}
        onLogout={handleLogout}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}
