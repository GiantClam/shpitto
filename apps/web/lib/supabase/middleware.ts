import { NextResponse, type NextRequest } from 'next/server'

const AUTH_CACHE_COOKIE_NAME = 'shpitto_auth_cache'

const PUBLIC_EXACT_PATHS = new Set<string>([
  '/',
  '/login',
  '/register',
  '/pricing',
  '/launch-center',
  '/auth/callback',
  '/auth/password',
  '/auth/signup',
  '/auth/session/repair',
  '/auth/email-verification/resend',
  '/auth/email-verification/confirm',
  '/auth/password/forgot',
  '/auth/password/reset',
  '/auth/auth-code-error',
  '/verify-email',
  '/reset-password',
  '/blog',
  '/robots.txt',
  '/sitemap.xml',
  '/legal/privacy',
  '/legal/terms',
])
const PUBLIC_PREFIXES = ['/blog/']

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function hasSupabaseAuthCookie(request: Pick<NextRequest, 'cookies'>): boolean {
  return request.cookies.getAll().some((cookie) => {
    const name = cookie.name
    return (
      /^sb-.+-auth-token(?:\.\d+)?$/.test(name) ||
      name === 'sb-access-token' ||
      name === 'sb-refresh-token' ||
      name === 'supabase-auth-token'
    )
  })
}

export function hasAuthCacheCookie(request: Pick<NextRequest, 'cookies'>): boolean {
  return Boolean(request.cookies.get(AUTH_CACHE_COOKIE_NAME)?.value)
}

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const pathname = request.nextUrl?.pathname || '/'
  const isPublic = isPublicPath(pathname)

  if (isPublic) {
    return response
  }

  if (!hasAuthCacheCookie(request)) {
    const nextPath = pathname + (request.nextUrl.search || '')
    const redirectUrl = request.nextUrl.clone()
    if (hasSupabaseAuthCookie(request)) {
      redirectUrl.pathname = '/auth/session/repair'
      redirectUrl.searchParams.set('next', nextPath)
      return NextResponse.redirect(redirectUrl)
    }
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('next', nextPath)
    return NextResponse.redirect(redirectUrl)
  }

  return response
}
