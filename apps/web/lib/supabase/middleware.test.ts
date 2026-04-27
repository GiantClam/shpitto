import { describe, expect, it, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { hasSupabaseAuthCookie, updateSession } from './middleware'

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}))

describe('supabase middleware', () => {
  beforeEach(() => {
    mocks.createServerClient.mockReset()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  })

  it('detects Supabase auth cookies', () => {
    expect(hasSupabaseAuthCookie(new NextRequest('http://localhost/'))).toBe(false)
    expect(
      hasSupabaseAuthCookie(
        new NextRequest('http://localhost/', {
          headers: { cookie: 'sb-example-auth-token=value' },
        }),
      ),
    ).toBe(true)
    expect(
      hasSupabaseAuthCookie(
        new NextRequest('http://localhost/', {
          headers: { cookie: 'sb-example-auth-token.0=value; sb-example-auth-token.1=value' },
        }),
      ),
    ).toBe(true)
  })

  it('bypasses public paths without creating a Supabase client when no auth cookie exists', async () => {
    const response = await updateSession(new NextRequest('http://localhost/'))

    expect(response.status).toBe(200)
    expect(mocks.createServerClient).not.toHaveBeenCalled()
  })

  it('allows public auth and blog entry routes without an existing session cookie', async () => {
    const authResponse = await updateSession(new NextRequest('http://localhost/auth/password'))
    const blogResponse = await updateSession(new NextRequest('http://localhost/blog'))

    expect(authResponse.status).toBe(200)
    expect(blogResponse.status).toBe(200)
    expect(mocks.createServerClient).not.toHaveBeenCalled()
  })

  it('does not warn for missing sessions on public paths with stale auth cookies', async () => {
    const sessionError = new Error('Auth session missing!')
    sessionError.name = 'AuthSessionMissingError'
    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn(async () => {
          throw sessionError
        }),
      },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const response = await updateSession(
      new NextRequest('http://localhost/', {
        headers: { cookie: 'sb-example-auth-token=value' },
      }),
    )

    expect(response.status).toBe(200)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
