# Deploy To Railway

## Prerequisites

1. A Railway account
2. Database, storage, and AI provider credentials
3. Stripe keys if billing is enabled

## Steps

1. Create a new Railway project from the repository.
2. Add the required environment variables from `.env.example`.
3. Provision the database or attach an external database.
4. Set the application start/build commands for Next.js.
5. Deploy and verify the required baseline routes.

## Notes

- Register the Railway production URL as the Stripe webhook target.
- Do not place payment secrets into public env variables.
