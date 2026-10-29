# security-controls

## Purpose

Configure optional authentication and abuse-prevention controls from the installed template's superadmin backend without exposing secrets or weakening server-side authorization.

## ADDED Requirements

### Requirement: REQ-SEC-01 Optional security controls

SMTP delivery, email verification, operator two-factor enforcement and Cloudflare Turnstile SHALL be independently configurable. Disabled controls SHALL not block account creation, password sign-in, the fresh-install first-owner claim or basic operator access. Enabled controls SHALL be enforced by the server, not only by the browser.

#### Scenario: SC-SEC-01 Optional controls disabled

- **WHEN** SMTP, email verification, 2FA enforcement and Turnstile are disabled
- **THEN** a valid password signup and sign-in can complete without an email delivery or authenticator dependency, and the fresh installation's one-time first owner can enter administration

#### Scenario: SC-SEC-02 One control enabled

- **WHEN** exactly one optional control is enabled
- **THEN** only that control changes the corresponding authentication boundary, while the other flows remain usable

### Requirement: REQ-SEC-02 Superadmin-only settings and secret handling

Security settings SHALL be readable and mutable only by an authenticated superadmin. SMTP URLs and Turnstile secret keys SHALL be encrypted at rest, accepted as write-only inputs, excluded from JSON responses, logs, audit payloads and browser state, and updated through an audited idempotent command.

#### Scenario: SC-SEC-03 Support or operator reads settings

- **WHEN** a support or operator session requests security settings
- **THEN** the server returns `403` and reveals no setting secret

#### Scenario: SC-SEC-04 Secret write and readback

- **WHEN** a superadmin saves an SMTP or Turnstile secret
- **THEN** the database stores ciphertext, the response exposes only configured/not-configured status, and a later save can retain the secret without returning it

### Requirement: REQ-SEC-03 Server-side Turnstile verification

When enabled, signup, password sign-in, password-reset and email-verification resend requests SHALL include a valid Cloudflare Turnstile token verified against Cloudflare Siteverify, configured application hostname and expected action. Missing, expired, foreign-host, wrong-action or failed tokens SHALL be rejected. When disabled, no Turnstile provider request SHALL occur.

#### Scenario: SC-SEC-05 Invalid Turnstile request

- **WHEN** Turnstile is enabled and the request has no valid token or the provider reports a foreign hostname
- **THEN** the server rejects the request without creating an account, session, reset effect or verification-email delivery

### Requirement: REQ-SEC-04 Optional operator 2FA policy

When 2FA enforcement is enabled, operator access and privileged commands SHALL retain same-session trusted step-up requirements. When it is disabled, operator access SHALL remain available after password authentication and privileged commands SHALL retain role, reason, version, idempotency and audit requirements without requiring a second-factor stamp.

#### Scenario: SC-SEC-06 Enable or disable 2FA enforcement

- **WHEN** a superadmin changes the 2FA enforcement setting
- **THEN** subsequent operator requests use the new server-side policy without requiring a deployment restart

### Requirement: REQ-SEC-05 Truthful SMTP behavior

When SMTP is disabled or not configured, the application SHALL report email delivery as unavailable for flows that require email and SHALL not claim that verification or password-reset mail was sent. Password-reset API responses SHALL remain indistinguishable for known and unknown account addresses. When SMTP is enabled, configured credentials and sender identity SHALL be used by the server-side mail adapter.

#### Scenario: SC-SEC-07 Password reset without SMTP

- **WHEN** a user requests a reset while SMTP is disabled
- **THEN** the reset page explains that email recovery is unavailable, and direct API responses remain generic without revealing whether the account exists
