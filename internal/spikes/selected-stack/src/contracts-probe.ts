import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { AdminContext } from 'react-admin';

// Import-only contract probe. It must not create a connection or read secrets.
export const selectedStackContractSymbols = {
  authFactory: betterAuth,
  authAdapter: drizzleAdapter,
  databaseFactory: drizzle,
  adminContext: AdminContext,
};
