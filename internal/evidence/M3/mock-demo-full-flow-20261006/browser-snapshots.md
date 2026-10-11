# Browser observations

The local in-app browser was served from `http://localhost:3100` with the seeded owner session.

- `/login` showed the shared `Shpitto` header, uniform primary navigation, owner/member demo credentials and a seeded invitation entry.
- `/dashboard?workspace=<seeded-team>` showed the team shell, 100 local demo credits, prompt generation form and the local Mock boundary message. After queueing a prompt and reloading, the same task showed `succeeded`, credits moved from reserved to consumed, and one private `video/mp4` asset exposed a Download link.
- `/workspaces/<seeded-team>/settings/members` showed the team member management shell, owner roster, invite field/button and transfer controls.
- `/invitations/accept?token=<seeded-token>` showed the seeded invitation entry and instructed the invited email to sign in before acceptance.
- `/workspaces/<seeded-team>/billing` showed Local Mock billing with `no real charge`, fixture products and portal controls. The fixture checkout displayed the explicit no-Stripe/no-real-charge message and reached `paid` after the simulated fixture event.
- `/admin` showed the expected actionable denied state for a non-operator demo account; operator authorization and revocation were verified separately by the operator probe.

Tokens and invitation values are omitted from this evidence file.
