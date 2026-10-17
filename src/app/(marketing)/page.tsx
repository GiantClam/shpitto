import {CreatorHome} from '../../components/creation/creator-home';
import {SiteShell} from '../../components/shell/site-shell';

export default async function HomePage({searchParams}: {searchParams: Promise<{mode?: string | string[]}>}) {
  const requested = (await searchParams).mode;
  const mode = requested === 'image-to-video' || requested === 'text-to-video' ? requested : undefined;
  return <SiteShell variant="creator"><CreatorHome initialMode={mode} /></SiteShell>;
}
