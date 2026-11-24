import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { DEFAULT_SEED_PASSWORD, verifyPassword } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const rows = await query<{ password_hash: string }>(
      `SELECT password_hash FROM m_usuario WHERE id = $1`,
      [auth.session.user.id]
    );

    const passwordHash = rows[0]?.password_hash || '';
    const mustChangePassword = passwordHash
      ? verifyPassword(DEFAULT_SEED_PASSWORD, passwordHash)
      : false;

    return NextResponse.json({
      success: true,
      user: {
        ...auth.session.user,
        must_change_password: mustChangePassword,
      },
      mustChangePassword,
    });
  } catch (error: unknown) {
    console.error('Error al verificar sesión actual:', error);
    const message =
      error instanceof Error ? error.message : 'Error al obtener la sesión actual';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
