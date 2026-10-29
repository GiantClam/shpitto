# Versioned developer documentation

## Purpose

Provide discoverable, release-matched documentation for developers evaluating and operating the source template, including complete Skill guidance and truthful API contracts shared with the offline buyer delivery.

## ADDED Requirements

### Requirement: REQ-DOC-01 Public versioned Fumadocs navigation

The separate vendor website SHALL expose public /docs using Fumadocs Core/UI 16.15.14 and MDX 15.4.5, with Template, Skills, APIs and Releases navigation, search, direct links, a version selector and per-page release labels. Default product documentation SHALL be English with a consistent localization boundary. Search SHALL index only published release content.

Trace: D04, D06, D30, J10, T56, T58, G04, G06, G30. Tasks: 8.12, 8.14, 9.12, 8.15.

#### Scenario: SC-DOC-01 Find template, Skills and API content

- **WHEN** a visitor opens vendor Docs or follows a direct page URL
- **THEN** Template, Skills and APIs are discoverable through navigation/search, deep links resolve and the current release label is visible

#### Scenario: SC-DOC-02 Switch documentation versions

- **WHEN** a reader selects a different published release or searches across its pages
- **THEN** navigation and examples resolve within the selected release; unpublished/private content is absent from the public search index and language remains consistent

### Requirement: REQ-DOC-02 Document actual interfaces and preserve deferred API scope

Template documentation SHALL explain capabilities, V1 exclusions, directory/module ownership, prerequisites, local demo, configuration, workspace/credits/tasks, deployment, upgrades and troubleshooting. API references SHALL derive from or be checked against released DTOs, routes and adapter contracts, identifying session-authenticated internal interfaces and extensions accurately. Public generation APIs and customer API keys MUST remain explicitly deferred; documentation MUST NOT invent authentication modes, live endpoints or nonfunctional settings.

Trace: D08, D15, D18, D30, J1, J9, J10, T01, T57, T58, G08, G15, G18, G30. Tasks: 8.13, 8.14, 8.15.

#### Scenario: SC-DOC-03 Follow release-matched setup and operations

- **WHEN** a buyer follows setup, configuration, local demo, deployment or upgrade examples for the delivered release
- **THEN** paths, commands, environment names and supported behavior match that release, and its necessary prerequisites and limitations are explicit

#### Scenario: SC-DOC-04 Check API examples against contracts

- **WHEN** a developer compares API documentation with released routes, DTOs, authorization and integration adapters
- **THEN** the examples match actual contracts and correctly label internal/session and webhook/service boundaries; public generation APIs and customer API-key management are not presented as available

### Requirement: REQ-DOC-03 Explain every shipped Skill

Docs SHALL include a release-matched reference and usable invocation example for all twelve Skills named by REQ-SKL-01, including parameters, inputs/outputs, supported agents, allowed scope, protected boundaries, required checks, rollback and escalation into an engineering change. Examples MUST NOT encourage bypassing the supported validation workflow.

Trace: D09, D28, D29, D30, J2, J10, T42, T57, G09, G28, G29, G30. Tasks: 8.13, 8.14, 8.15.

#### Scenario: SC-DOC-05 Audit twelve Skill references

- **WHEN** the release catalog is compared with Docs Skill pages and examples
- **THEN** each of the twelve shipped Skills has matching invocation and input/output/scope/recovery guidance, with no missing Skill or unsupported success claim

### Requirement: REQ-DOC-04 Share one content source with buyer guides

Canonical content SHALL reside in content/docs/<release>/ with release, title, description, section, status and related contract identifiers. The vendor Docs build and portable Markdown/code-snippet guides in docs/buyer/ SHALL derive from this maintained source. The customer package MUST include buyer-essential guides and matching version metadata while excluding the vendor shell, checkout, analytics and private records.

Trace: D16, D30, J1, J9, J10, T46, T47, T58, G16, G30. Tasks: 8.14, 9.1, 9.3, 8.15, 9.12, 9.14.

#### Scenario: SC-DOC-06 Export synchronized buyer guides

- **WHEN** a tagged content release is built for the sales site and the customer package
- **THEN** both outputs identify the same template/content release and contract references; setup/use guides remain readable without relying only on the remote vendor site

#### Scenario: SC-DOC-07 Exclude vendor implementation from documentation export

- **WHEN** the buyer-guide artifact is inspected in a clean source export
- **THEN** necessary guides and examples are included but vendor application code, analytics, purchase records, credentials and private engineering content are absent

### Requirement: REQ-DOC-05 Treat MDX as trusted source and sanitize examples

The Docs pipeline SHALL compile only trusted repository MDX. End-user content MUST NOT execute as MDX. Public and packaged examples SHALL use placeholders and sanitized fixtures rather than credentials, signed URLs or private customer data; public content status SHALL be enforced at build/index time.

Trace: D16, D30, J10, T46, T57, T58, G16, G30. Tasks: 8.12, 8.13, 8.14, 8.15.

#### Scenario: SC-DOC-08 Reject unsafe documentation input

- **WHEN** an untrusted MDX payload, unpublished page or secret-bearing example is offered to the documentation pipeline
- **THEN** untrusted content is not compiled/executed, unpublished content is not indexed publicly and secret-bearing examples fail the release checks

