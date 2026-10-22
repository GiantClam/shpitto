import {notFound} from 'next/navigation';
import {SiteShell} from '../../components/shell/site-shell';
import {GenerationPanel} from '../(app)/dashboard/generation-panel';
import {getRuntimeProfile} from '../../config/env';

export const dynamic = 'force-dynamic';

export default async function CreatorQaCheck({searchParams}: {searchParams: Promise<{models?: string}>}) {
  if (getRuntimeProfile() !== 'local') notFound();
  const quote = {modelId: 'mock-video', catalogVersion: 1, quantity: '1', unitCost: '10', totalCost: '10', issuedAt: '2026-10-17T00:00:00Z', quoteHash: 'isolated-ui-fixture-not-a-server-quote'};
  const textChoice = {label: 'Isolated text model', mode: 'text-to-video' as const, quote};
  const imageChoice = {label: 'Isolated image model', mode: 'image-to-video' as const, quote: {...quote, modelId: 'qa-image'}};
  return <SiteShell variant="workspace" workspaceId="qa-only"><main className="page workspace-page"><h1>Isolated UI fixture</h1><GenerationPanel workspaceId="qa-only" quote={quote} initialTask={null} modelChoices={(await searchParams).models === 'text' ? [textChoice] : [textChoice, imageChoice]} /></main></SiteShell>;
}
