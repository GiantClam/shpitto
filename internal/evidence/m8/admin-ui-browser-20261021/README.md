# Administration UI browser evidence

This evidence was captured against the current local administration implementation on October 21, 2026.

- Candidate: `local-candidate-20261021-admin-ui`
- Local application: `http://127.0.0.1:3101`
- Viewports: `1440x900` and `390x844`
- Raw snapshots, screenshots, and console logs: this directory
- File hashes: `manifest.json`

The browser checks covered:

- Unauthenticated administration entry.
- Operator, support, and superadmin navigation visibility.
- Video capability rendering.
- Image capability withholding for unsupported runtime controls.
- Loading, empty, offline error, and Retry recovery states.
- Operations, command, and recovery views.
- Keyboard focus order and visible focus behavior.
- Accessible names retained for collapsed navigation links.
- Desktop and mobile layout checks without overlapping content.

The raw console logs include the intentionally captured offline request failure used to verify the error state and Retry flow. The browser session was run against the exact current working tree after the collapsed-navigation accessible-name fix.
