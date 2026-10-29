import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

type Skill = {id: string; scope: string};
type Manifest = {version: string; source: string; navigation: Array<{title: string; path: string}>; [key: string]: unknown};

function stripHeading(source: string): string {
  return source.replace(/^#\s+[^\r\n]+\r?\n?/, '').trimStart();
}

export function renderSkillReference(skill: Skill, source: string): string {
  return `---\nrelease: v1\ntitle: Skill · ${skill.id}\nsection: skills\nstatus: published\nrelatedContracts: [D09, D28, D29, D30, G09, G28, G29]\n---\n\n# Skill · ${skill.id}\n\n${skill.scope}\n\nCanonical invocation: read \`skills/${skill.id}/SKILL.md\` and follow its evidence contract.\n\n${stripHeading(source)}\n\n## Release boundary\n\nThis reference describes the local governed workflow. Changes to external provider accounts, payment services, production email, payouts or protected business contracts require their separate stage evidence and are not authorized by this page.\n`;
}

export function synchronizeSkillDocs(root: string): {files: string[]; manifest: Manifest} {
  const registry = JSON.parse(readFileSync(path.join(root, 'skills/registry.json'), 'utf8')) as {skills: Skill[]};
  const manifestPath = path.join(root, 'content/docs/v1/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  const navigation = manifest.navigation.filter((entry) => !entry.title.startsWith('Skill · '));
  const files: string[] = [];
  for (const skill of registry.skills) {
    const relative = `content/docs/v1/skills/${skill.id}.mdx`;
    const output = path.join(root, relative);
    mkdirSync(path.dirname(output), {recursive: true});
    writeFileSync(output, renderSkillReference(skill, readFileSync(path.join(root, `skills/${skill.id}/SKILL.md`), 'utf8')), 'utf8');
    navigation.push({title: `Skill · ${skill.id}`, path: `skills/${skill.id}.mdx`});
    files.push(relative);
  }
  const next = {...manifest, navigation};
  writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return {files, manifest: next};
}

function run(): void {
  const result = synchronizeSkillDocs(process.cwd());
  console.log(JSON.stringify({status: 'PASS', generated: result.files.length, manifestEntries: result.manifest.navigation.length}, null, 2));
}

if (process.argv[1]?.endsWith('generate-skill-docs.ts')) run();

