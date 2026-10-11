# Latest Replicate contract review

Observed: 2026-10-09. The authenticated read-only Replicate API returned the current
latest versions for both selected Wan 2.2 models. The repository now pins those
versions and stores the API-reported OpenAPI schemas with refreshed SHA-256 values.

- T2V: `c483b1f7b892065bc58ebadb6381abf557f6b1f517d2ff0febb3fb635cf49b4d`
- I2V: `4eaf2b01d3bf70d8a2e00b219efeb7cb415855ad18b7dacdc4cae664a73a6eea`

The shared adapter mapping remains compatible: T2V requires `prompt`; I2V requires
`prompt` and `image`; safe resolution, frame count, FPS, safety checker and URI
output fields remain available. `liveEnabled` remains false until paid generation
and callback evidence is accepted.

No prediction was created. Task 5.10 remains open for authorized paid T2V/I2V
outputs, authenticated callbacks, durable media, cost and credit evidence.
