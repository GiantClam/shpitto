import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { setAuthCacheCookie } from '@/lib/supabase/auth-cache'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = '/launch-center'

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
      }
      return response
    } else {
      console.error(`[Auth Callback] Exchange Error:`, error)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
