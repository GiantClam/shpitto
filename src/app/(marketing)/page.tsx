import Image from 'next/image';
import {SiteShell} from '../../components/shell/site-shell';

const workflowCards = [
  {eyebrow: '01 · Text to video', title: 'Start with a scene.', copy: 'A place, a subject, a little movement. Describe what you imagine and choose a video model.', action: 'Create from a prompt'},
  {eyebrow: '02 · Image to video', title: 'Give a still a story.', copy: 'Bring your own image. Review the crop, choose your canvas and describe how the scene should move.', action: 'Animate your image'},
  {eyebrow: '03 · Your library', title: 'Keep the good takes.', copy: 'Return to your generation history and download ready videos from your private workspace.', action: 'Open your workspace'},
];

export default function HomePage() {
  return (
    <SiteShell>
      <main className="marketing-page">
        <section className="marketing-hero shell-container">
          <div className="marketing-hero-copy">
            <p className="eyebrow">A little imagination. A whole new scene.</p>
            <h1>Big ideas.<br />Made to <em>move.</em></h1>
            <p className="marketing-lede">Turn a prompt or a still image into your next video. One focused studio, from the first spark to the take you keep.</p>
            <div className="actions marketing-actions">
              <a className="button" href="/dashboard">Create a video <span aria-hidden="true">↗</span></a>
              <a className="button button-muted" href="#explore">Explore the possibilities</a>
            </div>
            <div className="marketing-proof" aria-label="Studio features">
              <span><i className="proof-dot proof-dot-green" />Private by default</span>
              <span><i className="proof-dot proof-dot-violet" />See credits before creating</span>
            </div>
          </div>
          <figure className="media-hero-stage">
            <Image className="hero-artwork" src="/media/alpine-studio.png" alt="An illuminated cabin on a quiet alpine lake beneath snow-covered mountains at sunrise" width={1536} height={1024} sizes="(max-width: 900px) 800px, 900px" loading="eager" fetchPriority="high" />
            <div className="media-stage-topline"><span>THE EVERYDAY, REIMAGINED</span><span className="media-sample-label">Sample artwork</span></div>
            <figcaption className="media-stage-caption"><span className="media-stage-kicker">ONE FRAME. A THOUSAND POSSIBILITIES.</span><strong>Somewhere<br />between a dream<br />and a destination.</strong><small>Original AI illustration · not a generated video</small></figcaption>
            <div className="media-prompt-card"><span>THE IDEA</span><p>A quiet alpine escape. Soft morning light.<br />Imagine a slow camera drift across the water.</p><a href="/dashboard" aria-label="Open the studio to write your own prompt">↗</a></div>
          </figure>
        </section>

        <div className="logo-strip shell-container" aria-label="Ways to create"><span>For your next</span><strong>brand story</strong><span aria-hidden="true">/</span><strong>social moment</strong><span aria-hidden="true">/</span><strong>creative experiment</strong></div>

        <section className="marketing-section shell-container" id="explore">
          <div className="section-intro"><p className="eyebrow">More possibility. Less friction.</p><h2>Your imagination,<br />with a place to go.</h2><p>Begin with words. Begin with an image. Make something worth a second look.</p></div>
          <div className="workflow-grid">{workflowCards.map((card) => <article className="workflow-card" key={card.eyebrow}><span>{card.eyebrow}</span><h3>{card.title}</h3><p>{card.copy}</p><a href="/dashboard">{card.action} <span aria-hidden="true">↗</span></a></article>)}</div>
        </section>

        <section className="studio-band shell-container" id="how-it-works">
          <div className="studio-band-copy"><p className="eyebrow">Find your creative rhythm</p><h2>From an idea<br />to your next take.</h2><p>Model, format, prompt and credits. Everything you need to make a deliberate choice, in one workspace.</p><a className="button button-light" href="/dashboard">Enter the studio <span aria-hidden="true">↗</span></a></div>
          <ol className="studio-steps"><li><span>01</span><div><h3>Set the scene</h3><p>Describe a subject, light and movement. Or upload an image you own and confirm its crop.</p></div></li><li><span>02</span><div><h3>Make it yours</h3><p>Pick a model and landscape or portrait format. Check the credit cost before you generate.</p></div></li><li><span>03</span><div><h3>Come back to the result</h3><p>Follow progress in your workspace, then download your ready video.</p></div></li></ol>
        </section>

        <section className="closing-callout shell-container"><p className="eyebrow">Your next idea starts here</p><h2>Make room for<br />a little wonder.</h2><a className="button" href="/dashboard">Start creating <span aria-hidden="true">↗</span></a><p>Exploring the template? <a href="/docs">Read the setup and customization guide.</a></p></section>
      </main>
    </SiteShell>
  );
}
