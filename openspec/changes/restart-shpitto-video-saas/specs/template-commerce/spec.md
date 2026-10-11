# Separate source-template commerce and delivery

## Purpose

Operate lightweight vendor source-license commerce and fulfillment without coupling buyer-operated SaaS billing, affiliates or runtime to seller accounts, while preserving acquired releases and update entitlements.

## ADDED Requirements

### Requirement: REQ-COM-01 Separate vendor commerce and buyer SaaS accounts

The vendor SHALL use a separate vendor/sales application with Lemon Squeezy hosted source-license checkout and its merchant affiliate program. Buyer SaaS payments SHALL use the buyer's Stripe account and optional FirstPromoter program. Accounts, credentials, orders, attribution, commission rules and settlement SHALL remain separate. A vendor license order MUST NOT grant video-service credits or inherit the SaaS workspace-first-payment rule. The customer build/runtime/export MUST NOT depend on vendor sales code or seller accounts; V1 SHALL NOT add a custom marketplace.

Trace: D01, D04, D11, D23, D24, J1, J5, J8, T21, T29, T46, T47, G01, G04, G11, G23, G24. Tasks: 9.10, 9.12, 9.15.

#### Scenario: SC-COM-01 Keep license sales outside SaaS entitlements

- **WHEN** a vendor source-license order is recorded or a buyer SaaS subscription is paid
- **THEN** the event affects only its own business records/account and no license payment creates workspace video credits or consumes SaaS affiliate eligibility

#### Scenario: SC-COM-02 Keep independent affiliate programs

- **WHEN** vendor affiliates and a buyer's optionally enabled FirstPromoter program are configured
- **THEN** credentials, referrals, orders, rules and payouts are isolated; the customer application and core local demo work without seller accounts or enabled buyer affiliates

### Requirement: REQ-COM-02 Manual clean Beta fulfillment

Beta fulfillment SHALL verify a paid source order and record buyer GitHub identity, acquired release, purchase date and update-entitlement end in vendor-only records. Delivery SHALL create a per-customer private repository from the clean export and provide the versioned checksum ZIP. Repository history and packages MUST exclude legacy/internal/vendor records and original development history. Manual access provisioning is supported; no automated marketplace is required.

Trace: D01, D04, D16, J1, J9, T46, T47, G01, G04, G16. Tasks: 9.3, 9.11, 9.15.

#### Scenario: SC-COM-03 Fulfill one paid source order

- **WHEN** the operator completes the documented manual fulfillment procedure for a verified buyer
- **THEN** the buyer receives access to their own clean private repository and matching checksum ZIP, with release and entitlement recorded privately and no other customer's records or original repository history disclosed

### Requirement: REQ-COM-03 Twelve-month updates without runtime expiry

A source purchase SHALL include twelve months of updates and basic technical support. Acquired releases and access to those acquired files SHALL remain usable after entitlement expiry; the runtime MUST NOT require a vendor license server or disable an acquired version. Later releases SHALL be delivered to the customer's private repository only while entitled, and renewal SHALL enable subsequent versions without resetting acquired ownership. Custom development and deployment assistance SHALL be separately priced services.

Trace: D16, D17, J1, J9, T50, T51, G16, G17. Tasks: 9.11, 9.13, 9.15.

#### Scenario: SC-COM-04 Preserve acquired code after expiry

- **WHEN** a buyer's twelve-month update/support entitlement expires
- **THEN** their acquired files remain accessible and deployed acquired version keeps running; future release delivery stops without revoking older code or exposing all future history through a shared repository

#### Scenario: SC-COM-05 Renew future release access

- **WHEN** an expired buyer renews or requests separately scoped customization/deployment assistance
- **THEN** renewal records eligibility for subsequent versions and migration guidance without changing past acquired releases; extra services are distinguished from included basic support

### Requirement: REQ-COM-04 Explicit commercial release prerequisites

The vendor release checklist SHALL record merchant approval, source-sale price, license project/seat limits, support scope, source-affiliate economics and supported payout onboarding before taking public orders. Undecided commercial values MUST remain explicitly unresolved and MUST NOT be fabricated or represented as approved requirements. Planning and sandbox walkthroughs SHALL NOT initiate live charges, payout transfers, invitations or publication without an authorized execution step.

Trace: D04, D17, D19, D23, J1, J8, J9, T30, T51, G04, G17, G19, G23. Tasks: 9.10, 9.13, 9.15.

#### Scenario: SC-COM-06 Gate public commerce on real prerequisites

- **WHEN** the sales site is considered ready to accept public source-license orders
- **THEN** merchant/account prerequisites and approved commercial terms are recorded; unknown values block that commercial action without reopening settled technical choices, and no plan-review status is treated as funds/publication authority

