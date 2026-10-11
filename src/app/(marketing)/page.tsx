import {SiteShell} from '../../components/shell/site-shell';
import {brand} from '../../config/brand';

export default function HomePage() {
  return (
    <SiteShell>
      <main className="page">
        <p className="eyebrow">Restart scaffold · milestone M1</p>
        <h1>{brand.tagline}</h1>
        <p>This root is the reviewed foundation for the buyer-facing product. Authentication, generation, billing and operations are introduced behind their milestone contracts.</p>
        <div className="actions">
          <a className="button" href="/docs">Read the contract preview</a>
          <a className="button button-muted" href="/dashboard">Open the app shell</a>
        </div>
      </main>
    </SiteShell>
  );
}
