import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ensureAuthTables, query } from './db';
import { hasAnyPermission, isAdminUser, parsePermisos } from './permissions';
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  extractSessionTokenFromHeader,
  verifySessionToken,
} from './session';
import type { ModuloPermiso, Usuario } from '@/types';

export interface AuthSession {
  user: Usuario;
}

export interface RequireAuthOptions {
  permissions?: readonly ModuloPermiso[];
  adminOnly?: boolean;
}

export type RequireAuthResult =
  | { ok: true; session: AuthSession }
  | { ok: false; response: NextResponse };

interface LiveUserRow {
  id: number;
  username: string;
  nombre_completo: string;
  email: string | null;
  rol_id: number;
  rol_nombre: string;
  permisos: unknown;
  activo: boolean;
  rol_activo: boolean;
  ultimo_acceso: string | null;
  creado_en: string | null;
}

/**
 * Valida la sesión HttpOnly contra firma HMAC y estado en vivo en BD,
 * aplicando comprobaciones RBAC fail-closed cuando se indican opciones.
 */
export async function requireAuth(
  req?: Request,
  options?: RequireAuthOptions
): Promise<RequireAuthResult> {
  let token = extractSessionTokenFromHeader(req?.headers?.get('cookie'));

  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
    } catch {
      // Fuera de contexto de Next.js (ej. pruebas unitarias)
      token = null;
    }
  }

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: 'No autenticado. Inicia sesión para continuar.' },
        { status: 401 }
      ),
    };
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    const res = NextResponse.json(
      { success: false, message: 'Sesión inválida o expirada. Inicia sesión nuevamente.' },
      { status: 401 }
    );
    clearSessionCookie(res);
    return { ok: false, response: res };
  }

  let rows: LiveUserRow[];
  try {
    await ensureAuthTables();
    rows = await query<LiveUserRow>(
      `SELECT u.id, u.username, u.nombre_completo, u.email,
              u.rol_id, r.nombre AS rol_nombre, r.permisos,
              u.activo, r.activo AS rol_activo,
              TO_CHAR(u.ultimo_acceso, 'YYYY-MM-DD HH24:MI') AS ultimo_acceso,
              TO_CHAR(u.creado_en, 'YYYY-MM-DD HH24:MI') AS creado_en
       FROM m_usuario u
       JOIN m_rol r ON r.id = u.rol_id
       WHERE u.id = $1`,
      [payload.uid]
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error al validar la sesión con la base de datos';
    return {
      ok: false,
      response: NextResponse.json({ success: false, message }, { status: 500 }),
    };
  }

  if (rows.length === 0 || !rows[0].activo || !rows[0].rol_activo) {
    const res = NextResponse.json(
      { success: false, message: 'Sesión no válida o usuario/rol desactivado.' },
      { status: 401 }
    );
    clearSessionCookie(res);
    return { ok: false, response: res };
  }

  const row = rows[0];
  const user: Usuario = {
    id: row.id,
    username: row.username,
    nombre_completo: row.nombre_completo,
    email: row.email,
    rol_id: row.rol_id,
    rol_nombre: row.rol_nombre,
    permisos: parsePermisos(row.permisos),
    activo: row.activo,
    ultimo_acceso: row.ultimo_acceso,
    creado_en: row.creado_en ?? undefined,
  };

  if (options?.adminOnly && !isAdminUser(user)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: 'Acceso denegado. Se requieren privilegios de administrador.' },
        { status: 403 }
      ),
    };
  }

  if (
    options?.permissions &&
    options.permissions.length > 0 &&
    !hasAnyPermission(user, options.permissions)
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: 'No tienes permisos suficientes para realizar esta acción.' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session: { user } };
}
