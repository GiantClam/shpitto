import Link from 'next/link'
import { safeAuthTheme, withAuthThemePath } from '@/lib/auth/theme'
import type { CSSProperties } from 'react'

export default async function AuthCodeError({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {}
  const theme = safeAuthTheme(params.theme)
  const projectId = String(Array.isArray(params.projectId) ? params.projectId[0] || '' : params.projectId || '').trim()
  const siteKey = String(Array.isArray(params.siteKey) ? params.siteKey[0] || '' : params.siteKey || '').trim()
  const loginHref = withAuthThemePath(
    '/login',
    String(Array.isArray(params.next) ? params.next[0] || '' : params.next || ''),
    theme,
    undefined,
    { projectId: projectId || undefined, siteKey: siteKey || undefined },
  )
  const style = theme
    ? ({
        "--shp-bg": theme.colors?.background,
        "--shp-surface": theme.colors?.surface,
        "--shp-panel": theme.colors?.panel,
        "--shp-text": theme.colors?.text,
        "--shp-muted": theme.colors?.muted,
        "--shp-border": theme.colors?.border,
        "--shp-primary": theme.colors?.primary,
        "--shp-primary-pressed": theme.colors?.primary,
        "--shp-accent": theme.colors?.accent,
        fontFamily: theme.typography || undefined,
      } as CSSProperties)
    : undefined

  return (
    <div className="min-h-screen flex items-center justify-center bg-[color-mix(in_oklab,var(--shp-bg)_92%,white_8%)] p-4" style={style}>
      <div className="max-w-md w-full bg-[var(--shp-panel)] rounded-2xl shadow-xl p-8 text-center border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)]">
        <div className="w-16 h-16 bg-[color-mix(in_oklab,var(--shp-primary)_12%,var(--shp-panel)_88%)] text-[var(--shp-primary)] rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-[var(--shp-text)] mb-2">Authentication Error</h2>
        <p className="text-[var(--shp-muted)] mb-8">
          We couldn&apos;t sign you in. This usually happens if the login link expired or was opened in a different browser.
        </p>
        <Link href={loginHref} className="inline-block px-6 py-3 bg-[var(--shp-primary)] text-white font-bold rounded-xl hover:bg-[var(--shp-primary-pressed)] transition-colors">
          Try Again
        </Link>
      </div>
    </div>
  )
}
