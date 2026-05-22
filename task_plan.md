1. Replace mojibake regex literals and replacement strings in workflow-artifact-language.ts with clean, intended ASCII/Unicode-safe equivalents.
2. Rewrite workflow-artifact-language.test.ts fixtures/expectations to clean literals that match the repaired sanitizer behavior.
3. Run focused Vitest coverage for workflow-artifact-language and report any remaining risk.
