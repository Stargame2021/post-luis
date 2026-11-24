import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { hashPassword, isDefaultPassword, verifyPassword } from '@/lib/auth';
import { query } from '@/lib/db';

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    let body: { currentPassword?: unknown; newPassword?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Cuerpo de solicitud inválido' },
        { status: 400 }
      );
    }

    const currentPassword =
      typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword =
      typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        {
          success: false,
          message: 'La contraseña actual y la nueva contraseña son requeridas',
        },
        { status: 400 }
      );
    }

    if (newPassword.trim().length < 8) {
      return NextResponse.json(
        {
          success: false,
          message: 'La nueva contraseña debe tener al menos 8 caracteres',
        },
        { status: 400 }
      );
    }

    if (isDefaultPassword(newPassword)) {
      return NextResponse.json(
        {
          success: false,
          message: 'La nueva contraseña no puede ser la contraseña por defecto',
        },
        { status: 400 }
      );
    }

    const rows = await query<{ password_hash: string }>(
      `SELECT password_hash FROM m_usuario WHERE id = $1`,
      [auth.session.user.id]
    );

    if (rows.length === 0 || !verifyPassword(currentPassword, rows[0].password_hash)) {
      return NextResponse.json(
        { success: false, message: 'La contraseña actual es incorrecta' },
        { status: 401 }
      );
    }

    const nextHash = hashPassword(newPassword);
    await query(`UPDATE m_usuario SET password_hash = $1 WHERE id = $2`, [
      nextHash,
      auth.session.user.id,
    ]);

    return NextResponse.json({
      success: true,
      message: 'Contraseña actualizada exitosamente',
    });
  } catch (error: unknown) {
    console.error('Error al cambiar contraseña:', error);
    const message =
      error instanceof Error ? error.message : 'Error al actualizar la contraseña';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
