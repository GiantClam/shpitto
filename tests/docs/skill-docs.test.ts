import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSkillReference} from '../../scripts/generate-skill-docs.ts';

test('skill reference includes invocation, protected boundary and deferred external scope', () => {
  const page = renderSkillReference({id: 'customize-brand', scope: 'brand tokens'}, '# customize-brand\n\n## Inputs\n\nvalue');
  assert.match(page, /status: published/);
  assert.match(page, /skills\/customize-brand\/SKILL\.md/);
  assert.match(page, /external provider accounts/);
  assert.match(page, /## Inputs/);
});

test('generated skill pages match the registry and are present in Docs navigation', () => {
  const registry = JSON.parse(readFileSync('skills/registry.json', 'utf8'));
  const manifest = JSON.parse(readFileSync('content/docs/v1/manifest.json', 'utf8'));
  for (const skill of registry.skills) {
    assert.ok(manifest.navigation.some((entry: {title: string; path: string}) => entry.title === `Skill · ${skill.id}` && entry.path === `skills/${skill.id}.mdx`));
    assert.match(readFileSync(`content/docs/v1/skills/${skill.id}.mdx`, 'utf8'), /status: published/);
  }
});
