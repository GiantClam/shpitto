import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

const isProduction = process.env.NODE_ENV === 'production';
const hasGoogleAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const isTemplatePreview = process.env.SHPITTO_TEMPLATE_PREVIEW === 'true' || process.env.SHPITTO_TEMPLATE_PREVIEW === '1';
const isPreviewRuntime = isTemplatePreview && !isProduction;
const enablePreviewCredentials = !hasGoogleAuth && (isTemplatePreview || (!isProduction && (process.env.ENABLE_DEV_USER === 'true' || process.env.ENABLE_DEV_USER === '1' || typeof process.env.ENABLE_DEV_USER === 'undefined')));
function configuredAdminEmails(): string[] {
  return String(process.env.CMS_ADMIN_EMAILS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export function isTemplateAdmin(userOrEmail: string | { email?: string }): boolean {
  const email = typeof userOrEmail === 'string' ? userOrEmail : String(userOrEmail.email || '');
  if (isPreviewRuntime && email.trim().toLowerCase() === 'preview@shpitto.local') return true;
  return configuredAdminEmails().includes(email.trim().toLowerCase());
}


export type TemplateAuthMode = 'google' | 'preview-credentials' | 'unconfigured';

export function getTemplateAuthMode(): TemplateAuthMode {
  if (hasGoogleAuth) return 'google';
  if (enablePreviewCredentials) return 'preview-credentials';
  return 'unconfigured';
}

export type TemplateSessionUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
};

const providers = [];

if (hasGoogleAuth) {
  providers.push(
    GoogleProvider({
      clientId: String(process.env.GOOGLE_CLIENT_ID),
      clientSecret: String(process.env.GOOGLE_CLIENT_SECRET),
    }),
  );
}

if (enablePreviewCredentials) {
  providers.push(
    CredentialsProvider({
      id: 'dev-user',
      name: 'Preview User',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || '').trim().toLowerCase();
        const password = String(credentials?.password || '');
        if (!enablePreviewCredentials) return null;
        if (!email || !email.includes('@') || password.length < 6) return null;
        const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) || 'Creator';
        return { id: 'dev-user-local', email, name };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  pages: {
    signIn: '/sign-in',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as TemplateSessionUser).id = String(token.sub || 'dev-user-local');
        session.user.email = String(token.email || 'demo@fluxkreafree.com');
        session.user.name = String(token.name || 'Creator');
        (session.user as TemplateSessionUser).role = isTemplateAdmin(String(session.user.email)) ? 'admin' : 'user';
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || (isProduction ? undefined : 'shpitto-template-dev-secret'),
};

export function assertTemplateAuthConfig(): void {
  if (isProduction && !String(process.env.NEXTAUTH_SECRET || '').trim()) throw new Error('NEXTAUTH_SECRET is required in production.');
  if (isProduction && isTemplatePreview) throw new Error('SHPITTO_TEMPLATE_PREVIEW is only allowed outside production.');
}

export async function getTemplateSessionUser(): Promise<TemplateSessionUser | null> {
  assertTemplateAuthConfig();
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.name) return isPreviewRuntime ? { id: 'preview-user', email: 'preview@shpitto.local', name: 'Preview Admin', role: 'admin' } : null;
  return {
    id: String((session.user as TemplateSessionUser).id || 'dev-user-local'),
    email: String(session.user.email),
    name: String(session.user.name),
    role: isTemplateAdmin(String(session.user.email)) ? 'admin' : 'user',
  };
}
