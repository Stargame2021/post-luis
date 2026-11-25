'use client';

import { useCallback, useEffect, useState } from 'react';
import { DashboardData, Producto, Tasa, Usuario } from '@/types';
import { hasTabPermission } from '@/lib/permissions';

export function useAppSession(params: { onResetNavigation: () => void }) {
  const { onResetNavigation } = params;

  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [dbConnected, setDbConnected] = useState(true);
  const [storeName, setStoreName] = useState('Tienda Express');
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
    onResetNavigation();
    setShowLoginModal(true);
  }, [onResetNavigation]);

  useEffect(() => {
    let active = true;

    const initSessionAndTheme = async () => {
      await Promise.resolve();
      if (!active) return;

      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark') {
        setIsDarkMode(true);
        document.documentElement.classList.add('dark');
      } else {
        setIsDarkMode(false);
        document.documentElement.classList.remove('dark');
      }

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

    void initSessionAndTheme();

    fetch('/api/empresa', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.success && d.empresa?.nombre_comercial) {
          setStoreName(String(d.empresa.nombre_comercial));
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const handleLoginSuccess = useCallback((user: Usuario, requirePasswordChange?: boolean) => {
    setCurrentUser(user);
    setShowLoginModal(false);
    setMustChangePassword(Boolean(requirePasswordChange));
  }, []);

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

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      const nextDark = !prev;
      if (nextDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      return nextDark;
    });
  }, []);

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

      const canFetchProducts =
        hasTabPermission(currentUser, 'pos') ||
        hasTabPermission(currentUser, 'products') ||
        hasTabPermission(currentUser, 'price_list') ||
        hasTabPermission(currentUser, 'compras');

      // Ejecutar las cargas en paralelo (Promise.all) para minimizar latencia post-venta (P1-7)
      const [prodOutcome, rateOutcome, historyOutcome, dashOutcome, empresaOutcome] =
        await Promise.all([
          canFetchProducts ? requestJson('/api/productos') : Promise.resolve(null),
          requestJson('/api/tasa'),
          requestJson('/api/tasa?all=true'),
          requestJson('/api/dashboard'),
          requestJson('/api/empresa'),
        ]);

      if (
        prodOutcome?.status === 'unauthorized' ||
        rateOutcome.status === 'unauthorized' ||
        historyOutcome.status === 'unauthorized' ||
        dashOutcome.status === 'unauthorized'
      ) {
        resetClientSession();
        return;
      }

      if (!canFetchProducts || prodOutcome?.status === 'forbidden') {
        setProducts([]);
      } else if (prodOutcome) {
        if (prodOutcome.status === 'server_error' || prodOutcome.status === 'error') {
          hasDbFailure = true;
        } else if (prodOutcome.data?.success) {
          setProducts(prodOutcome.data.products || []);
          hasDbSuccess = true;
        } else {
          hasDbFailure = true;
        }
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

      if (historyOutcome.status === 'server_error' || historyOutcome.status === 'error') {
        hasDbFailure = true;
      } else if (historyOutcome.status === 'ok' && historyOutcome.data?.success) {
        setHistoryRates(historyOutcome.data.rates || []);
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

      if (
        empresaOutcome.status === 'ok' &&
        empresaOutcome.data?.success &&
        empresaOutcome.data.empresa?.nombre_comercial
      ) {
        setStoreName(String(empresaOutcome.data.empresa.nombre_comercial));
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
    if (!currentUser || mustChangePassword) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) {
        void fetchData();
      }
    });
    return () => {
      active = false;
    };
  }, [currentUser, mustChangePassword, fetchData]);

  return {
    currentUser,
    authLoading,
    mustChangePassword,
    setMustChangePassword,
    showLoginModal,
    setShowLoginModal,
    isDarkMode,
    toggleTheme,
    dbConnected,
    storeName,
    products,
    currentRate,
    historyRates,
    dashboardData,
    isRefreshing,
    fetchData,
    handleLoginSuccess,
    handleLogout,
    resetClientSession,
  };
}
