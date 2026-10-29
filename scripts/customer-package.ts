type Package = Record<string, unknown> & {scripts: Record<string, string>};

// Release engineering is deliberately absent from the buyer's command surface.
const commands = [
  'dev', 'build', 'start', 'typecheck', 'lint', 'format', 'format:check',
  'verify:config', 'verify:db-boundary', 'verify:local-services', 'verify:shells',
  'verify:content-boundaries', 'validate:change', 'export:release', 'deploy:release',
  'rollback:customization', 'db:migrate', 'ops:owner', 'worker:local', 'mail:capture',
  'demo:seed', 'demo:reset', 'services:up', 'services:down', 'services:status',
] as const;

export function createCustomerPackage(source: Package): Package {
  const scripts = Object.fromEntries(commands.map((name) => {
    if (!source.scripts[name]) throw new Error(`Required buyer command is missing: ${name}`);
    return [name, source.scripts[name]];
  }));
  return {...source, scripts: {...scripts, verify: 'pnpm typecheck && pnpm lint && pnpm format:check && pnpm verify:config && pnpm verify:db-boundary && pnpm verify:local-services && pnpm verify:shells && pnpm verify:content-boundaries && pnpm build'}};
}

export function validateCustomerCommands(candidate: Pick<Package, 'scripts'>, exists: (file: string) => boolean): string[] {
  return Object.entries(candidate.scripts).flatMap(([name, command]) => [
    ...[...command.matchAll(/\b(scripts\/[\w/.-]+\.(?:ts|mjs|js))/g)]
      .filter((match) => !exists(match[1])).map((match) => `${name} references missing file ${match[1]}`),
    ...[...command.matchAll(/\bpnpm ([\w:-]+)/g)]
      .filter((match) => !candidate.scripts[match[1]]).map((match) => `${name} references missing command ${match[1]}`),
  ]);
}
