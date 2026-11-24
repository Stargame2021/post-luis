import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'pos_session';

const PUBLIC_API_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/login/',
  '/api/auth/logout',
  '/api/auth/logout/',
]);

/**
 * Proxy de Next.js 16 para exigir presencia y formato mínimo de cookie pos_session
 * en todas las rutas /api/* excepto /api/auth/login y /api/auth/logout.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Permitir lectura pública de la identidad de la tienda (para LoginModal); mutaciones requieren sesión
  if (
    request.method === 'GET' &&
    (pathname === '/api/empresa' || pathname === '/api/empresa/')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { success: false, message: 'No autenticado. Inicia sesión para continuar.' },
      { status: 401 }
    );
  }

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    return NextResponse.json(
      { success: false, message: 'No autenticado. Inicia sesión para continuar.' },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
