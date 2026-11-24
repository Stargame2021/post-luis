import type { ModuloPermiso, Usuario } from '@/types';

/**
 * Lista canónica de permisos de módulo soportados por el sistema.
 */
export const ALL_PERMISSIONS: readonly ModuloPermiso[] = [
  'pos',
  'price_list',
  'orders',
  'compras',
  'pagos',
  'products',
  'import_excel',
  'terceros',
  'bancos',
  'rates',
  'impuestos',
  'reports',
  'reports_profit',
  'users',
  'maintenance',
] as const;

const ALL_PERMISSIONS_SET = new Set<string>(ALL_PERMISSIONS);

/**
 * Determina si un usuario pertenece al rol administrador principal.
 */
export function isAdminUser(
  user: Pick<Usuario, 'rol_id' | 'rol_nombre'> | null | undefined
): boolean {
  return Boolean(
    user &&
      (Number(user.rol_id) === 1 ||
        String(user.rol_nombre || '').toUpperCase() === 'ADMINISTRADOR')
  );
}

/**
 * Parsea un arreglo o JSON de permisos validando cada clave contra ALL_PERMISSIONS.
 */
export function parsePermisos(raw: unknown): ModuloPermiso[] {
  let candidate: unknown = raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(candidate)) {
    return [];
  }

  const seen = new Set<ModuloPermiso>();
  for (const item of candidate) {
    if (typeof item === 'string' && ALL_PERMISSIONS_SET.has(item)) {
      seen.add(item as ModuloPermiso);
    }
  }

  return Array.from(seen);
}

/**
 * Verifica si el usuario posee al menos uno de los permisos requeridos (fail-closed).
 */
export function hasAnyPermission(
  user: Pick<Usuario, 'rol_id' | 'rol_nombre' | 'permisos'> | null | undefined,
  required: readonly ModuloPermiso[]
): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  if (required.length === 0) return true;
  if (!Array.isArray(user.permisos)) return false;
  return required.some((p) => user.permisos!.includes(p));
}

/**
 * Evalúa si el usuario tiene acceso a una pestaña o subpestaña de la interfaz (fail-closed).
 */
export function hasTabPermission(
  user: Pick<Usuario, 'rol_id' | 'rol_nombre' | 'permisos'> | null | undefined,
  tab: string,
  subTab?: string
): boolean {
  if (!user) return false;
  if (tab === 'menu' || tab === 'dashboard') return true;
  if (isAdminUser(user)) return true;
  if (!Array.isArray(user.permisos)) return false;

  const perms = user.permisos;

  switch (tab) {
    case 'pos':
      return perms.includes('pos');
    case 'price_list':
      return perms.includes('price_list') || perms.includes('pos');
    case 'orders':
      return perms.includes('orders');
    case 'compras':
      return perms.includes('compras');
    case 'pagos':
      return perms.includes('pagos');
    case 'products':
      return perms.includes('products');
    case 'import_excel':
      return perms.includes('import_excel') || perms.includes('products');
    case 'terceros':
      return perms.includes('terceros');
    case 'bancos':
      return perms.includes('bancos');
    case 'impuestos':
      return perms.includes('impuestos');
    case 'rates':
      return perms.includes('rates');
    case 'users':
      return perms.includes('users');
    case 'maintenance':
    case 'db_config':
      return false;
    case 'reports':
      if (subTab === 'rentabilidad') {
        return perms.includes('reports_profit');
      }
      return perms.includes('reports') || perms.includes('reports_profit');
    default:
      return false;
  }
}
