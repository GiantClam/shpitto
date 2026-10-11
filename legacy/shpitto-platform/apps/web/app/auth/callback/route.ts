import { NextResponse } from 'next/server'
import { recordProjectAuthUserActivity } from '@/lib/agent/db'
import { createClient } from '@/lib/supabase/server'
import { setAuthCacheCookie } from '@/lib/supabase/auth-cache'
import { safeAuthNextPath } from '@/lib/auth/next-path'
import { safeAuthTheme, serializeAuthTheme } from '@/lib/auth/theme'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeAuthNextPath(searchParams.get('next'))
  const theme = safeAuthTheme(searchParams.get('theme'))
  const projectId = String(searchParams.get('projectId') || '').trim()
  const siteKey = String(searchParams.get('siteKey') || '').trim()

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`)
      const user = data.user || data.session?.user
      if (user?.id) {
        setAuthCacheCookie(response, {
          id: user.id,
          email: user.email || undefined,
        })
        void recordProjectAuthUserActivity({
          projectId: projectId || undefined,
          siteKey: siteKey || undefined,
          authUserId: user.id,
          email: user.email || '',
          emailVerified: Boolean(user.email_confirmed_at),
          event: 'oauth_login',
        }).catch((recordError) => {
          console.warn('[Auth Callback] project auth activity sync failed:', recordError)
        })
      }
      return response
    } else {
      console.error(`[Auth Callback] Exchange Error:`, error)
    }
  }

  // return the user to an error page with instructions
  const errorUrl = new URL('/auth/auth-code-error', origin)
  errorUrl.searchParams.set('next', next)
  if (projectId) errorUrl.searchParams.set('projectId', projectId)
  if (siteKey) errorUrl.searchParams.set('siteKey', siteKey)
  const themeQuery = serializeAuthTheme(theme)
  if (themeQuery) errorUrl.searchParams.set('theme', themeQuery)
  return NextResponse.redirect(errorUrl)
}
