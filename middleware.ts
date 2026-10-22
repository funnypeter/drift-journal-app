import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Cheap gate: no session cookie → login. The cookie itself is validated
// against D1 by getSession() in pages and API routes.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const hasSession = !!req.cookies.get('dj_session')?.value

  // Public: the share route (anyone with the link can view a public trip),
  // photos, the auth pages and the sign-in API.
  const isPublic =
    pathname.startsWith('/auth') ||
    pathname.startsWith('/share') ||
    pathname.startsWith('/photos') ||
    pathname === '/api/auth'

  if (!hasSession && !isPublic) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = '/auth/login'
    redirectUrl.searchParams.set('redirectedFrom', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|swe-worker-.*|manifest.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
