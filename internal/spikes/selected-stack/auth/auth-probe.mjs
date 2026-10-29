import { betterAuth } from 'better-auth/minimal';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { bearer } from 'better-auth/plugins/bearer';

const database = memoryAdapter({
  user: [],
  session: [],
  account: [],
  verification: [],
});
const auth = betterAuth({
  database,
  secret: 'm0-disposable-secret-that-is-long-enough',
  baseURL: 'http://localhost:3000',
  emailAndPassword: { enabled: true },
  plugins: [bearer()],
});

const signUp = await auth.api.signUpEmail({
  body: {
    email: 'm0-user@example.test',
    password: 'M0-password-123!',
    name: 'M0 User',
  },
});

if (!signUp?.user?.email) throw new Error('Better Auth signup did not return a user');

const signIn = await auth.api.signInEmail({
  body: { email: 'm0-user@example.test', password: 'M0-password-123!' },
});
if (!signIn?.token && !signIn?.session?.token && !signIn?.data?.session?.token) throw new Error(`Better Auth sign-in failed: ${JSON.stringify(signIn)}`);
const session = await auth.api.getSession({
  headers: new Headers({ authorization: `Bearer ${signIn.token ?? signIn.session?.token ?? signIn.data.session.token}` }),
});

if (!session?.session?.userId) throw new Error(`Better Auth session was not persisted: ${JSON.stringify(session)}`);

const result = {
  authenticated: true,
  sessionUserIdPresent: Boolean(session.session?.userId ?? session.data?.session?.userId),
  operatorRoleGrantedByAuth: false,
  adapter: 'Better Auth public memory adapter',
  externalCalls: 0,
};

console.log(JSON.stringify(result));
