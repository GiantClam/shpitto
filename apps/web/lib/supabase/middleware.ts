import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_EXACT_PATHS = new Set<string>([
  '/',
  '/login',
  '/launch-center',
  '/auth/callback',
  '/auth/password',
  '/auth/signup',
  '/auth/email-verification/resend',
  '/auth/email-verification/confirm',
  '/auth/password/forgot',
  '/auth/password/reset',
  '/auth/auth-code-error',
  '/verify-email',
  '/reset-password',
  '/blog',
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

function isAuthSessionMissingError(error: unknown): boolean {
  const anyError = error as { name?: unknown; message?: unknown }
  return (
    String(anyError?.name || '') === 'AuthSessionMissingError' ||
    String(anyError?.message || '').toLowerCase().includes('auth session missing')
  )
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const pathname = request.nextUrl?.pathname || '/'
  const isPublic = isPublicPath(pathname)

  if (isPublic && !hasSupabaseAuthCookie(request)) {
    return response
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isPublic) return response
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname + (request.nextUrl.search || ''))
    loginUrl.searchParams.set('reason', 'supabase_env_missing')
    return NextResponse.redirect(loginUrl)
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  let user: any = null
  try {
    const {
      data: { user: currentUser },
      error,
    } = await supabase.auth.getUser()
    if (error) throw error
    user = currentUser
  } catch (error) {
    if (isPublic) {
      if (!isAuthSessionMissingError(error)) {
        console.warn('[supabase-middleware] getUser failed on public path, bypassing:', error)
      }
      return response
    }
    if (hasSupabaseAuthCookie(request) && isAuthSessionMissingError(error)) {
      return response
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname + (request.nextUrl.search || ''))
    loginUrl.searchParams.set('reason', 'auth_check_failed')
    return NextResponse.redirect(loginUrl)
  }

  if (!isPublic && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname + (request.nextUrl.search || ''))
    return NextResponse.redirect(loginUrl)
  }

  return response
}
