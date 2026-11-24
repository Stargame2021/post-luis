import { NextResponse } from 'next/server';
import { query, ensureAuthTables } from '@/lib/db';
import {
  hashPassword,
  isDefaultPassword,
  needsRehash,
  verifyPassword,
} from '@/lib/auth';
import { parsePermisos } from '@/lib/permissions';
import { attachSessionCookie, createSessionToken } from '@/lib/session';

interface LoginUserRow {
  id: number;
  username: string;
  password_hash: string;
  nombre_completo: string;
  email: string | null;
  rol_id: number;
  rol_nombre: string;
  permisos: unknown;
  activo: boolean;
  rol_activo: boolean;
}

export async function POST(req: Request) {
  try {
    await ensureAuthTables();

    let body: { username?: unknown; password?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Cuerpo de solicitud inválido' },
        { status: 400 }
      );
    }

    const { username, password } = body;

    if (
      typeof username !== 'string' ||
      !username.trim() ||
      typeof password !== 'string' ||
      !password
    ) {
      return NextResponse.json(
        { success: false, message: 'Usuario y contraseña son requeridos' },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim().toLowerCase();

    const users = await query<LoginUserRow>(
      `SELECT u.id, u.username, u.password_hash, u.nombre_completo, u.email,
              u.rol_id, r.nombre as rol_nombre, r.permisos, u.activo, r.activo as rol_activo
       FROM m_usuario u
       JOIN m_rol r ON r.id = u.rol_id
       WHERE LOWER(u.username) = $1`,
      [cleanUsername]
    );

    if (users.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Usuario o contraseña incorrectos' },
        { status: 401 }
      );
    }

    const user = users[0];

    const isValid = verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { success: false, message: 'Usuario o contraseña incorrectos' },
        { status: 401 }
      );
    }

    if (!user.activo || !user.rol_activo) {
      return NextResponse.json(
        {
          success: false,
          message: 'Este usuario está desactivado. Contacta al administrador.',
        },
        { status: 403 }
      );
    }

    if (needsRehash(user.password_hash)) {
      const upgradedHash = hashPassword(password);
      await query(
        `UPDATE m_usuario SET password_hash = $1, ultimo_acceso = CURRENT_TIMESTAMP WHERE id = $2`,
        [upgradedHash, user.id]
      );
    } else {
      await query(`UPDATE m_usuario SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = $1`, [
        user.id,
      ]);
    }

    const permisosParsed = parsePermisos(user.permisos);
    const mustChangePassword = isDefaultPassword(password);
    const token = createSessionToken(user.id);

    const response = NextResponse.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      mustChangePassword,
      user: {
        id: user.id,
        username: user.username,
        nombre_completo: user.nombre_completo,
        email: user.email,
        rol_id: user.rol_id,
        rol_nombre: user.rol_nombre,
        permisos: permisosParsed,
        activo: user.activo,
        must_change_password: mustChangePassword,
      },
    });

    attachSessionCookie(response, token);
    return response;
  } catch (error: unknown) {
    console.error('Error en login:', error);
    const message =
      error instanceof Error ? error.message : 'Error en el servidor al autenticar';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
