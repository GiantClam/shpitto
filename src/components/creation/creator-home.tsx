'use client';

import Image from 'next/image';
import {useRouter} from 'next/navigation';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {saveCreationDraft, readCreationDraft, type CreationDraft} from '../generation/creation-draft';
import {MediaIcon} from './media-icon';
import {exampleCategories, filterCreationExamples, type CreationExample, type ExampleCategory} from './examples';

type CreationMode = CreationDraft['mode'];

export function CreatorHome({initialMode}: Readonly<{initialMode?: CreationMode}>) {
  const router = useRouter();
  const [mode, setMode] = useState<CreationMode>(initialMode ?? 'text-to-video');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<CreationDraft['aspectRatio']>('16:9');
  const [category, setCategory] = useState<ExampleCategory>('All');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const draft = readCreationDraft(window.sessionStorage);
      if (draft) {setPrompt(draft.prompt); setMode(initialMode ?? draft.mode); setAspectRatio(draft.aspectRatio); if (draft.prompt) setNotice('Your draft is here. Keep creating.');}
    } catch { /* Storage can be blocked; editing still works without it. */ }
    setDraftReady(true);
  }, []);
  useEffect(() => {if (initialMode) setMode(initialMode);}, [initialMode]);
  useEffect(() => {
    if (!draftReady) return;
    try {saveCreationDraft(window.sessionStorage, {version: 1, prompt, mode, aspectRatio});}
    catch { /* Continue explicitly reports storage failures instead of losing a prompt. */ }
  }, [draftReady, prompt, mode, aspectRatio]);

  function chooseMode(next: CreationMode) {
    setMode(next); setError(''); setNotice('');
    router.replace(`/?mode=${next}`, {scroll: false});
  }

  function useExample(example: CreationExample) {
    setPrompt(example.prompt);
    setError(''); setNotice(`“${example.title}” prompt added. Make it your own.`);
    promptRef.current?.focus();
  }

  function continueToStudio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim()) {setError('Describe the video you want to create.'); promptRef.current?.focus(); return;}
    try {
      const saved = saveCreationDraft(window.sessionStorage, {version: 1, prompt: prompt.trim(), mode, aspectRatio});
      if (!saved) throw new Error('storage');
      router.push('/dashboard');
    } catch {
      setError('Your browser could not save this draft. Copy your prompt before opening the studio.');
    }
  }

  return <main className="creator-home">
    <section className="creator-start" id="create" aria-labelledby="creator-title">
      <p className="creator-eyebrow"><span className="shell-status-dot" /> AI VIDEO GENERATOR · PRIVATE BY DEFAULT</p>
      <h1 id="creator-title">Create a video from a prompt or image.</h1>
      <p className="creator-subtitle">Choose how to start, describe the motion, then review your model and credits before you generate.</p>
      <div className="creation-modes" role="group" aria-label="Video input mode">
        <button type="button" aria-pressed={mode === 'text-to-video'} onClick={() => chooseMode('text-to-video')}><MediaIcon name="video" />Text to video</button>
        <button type="button" aria-pressed={mode === 'image-to-video'} onClick={() => chooseMode('image-to-video')}><MediaIcon name="image" />Image to video</button>
      </div>
      <form className="public-composer" onSubmit={continueToStudio}>
        <div className="public-prompt-area">
          {mode === 'image-to-video' ? <div className="guest-image-input"><MediaIcon name="image" /><div><strong>Start with your image</strong><p>Continue to your studio to upload and confirm the crop. Your image is uploaded only after you choose it there.</p></div></div> : null}
          <label className="sr-only" htmlFor="creation-prompt">Describe your video</label>
          <textarea ref={promptRef} id="creation-prompt" value={prompt} onChange={(event) => {setPrompt(event.target.value); setError('');}} maxLength={10000} required placeholder={mode === 'image-to-video' ? 'How should your image move? Describe the motion, camera and mood…' : 'Describe your idea. A place, a subject, a little movement…'} aria-describedby="creation-help" />
        </div>
        <div className="public-composer-toolbar">
          <div className="composer-settings">
            <label className="canvas-control"><span>Canvas</span><select aria-label="Video canvas" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as CreationDraft['aspectRatio'])}><option value="16:9">16:9</option><option value="9:16">9:16</option></select></label>
            <span className="fixed-setting">5s <span aria-hidden="true">·</span> 720p</span>
            <details className="model-details"><summary>Model & credits</summary><p>Choose an available video model and review its exact credit cost in your workspace. Nothing generates until you confirm.</p></details>
          </div>
          <button className="button create-button" type="submit"><MediaIcon name="spark" />{mode === 'image-to-video' ? 'Continue to image upload' : 'Continue to studio'}<MediaIcon name="arrow" /></button>
        </div>
      </form>
      <div className="composer-underliner"><p id="creation-help">Sign in to choose a model, review credits and generate. Your prompt comes with you.</p><span>{prompt.length.toLocaleString('en-US')} / 10,000</span></div>
      {error ? <p className="creation-feedback creation-error" role="alert">{error} <a href="/dashboard">Open studio</a></p> : notice ? <p className="creation-feedback" role="status">{notice}</p> : null}
    </section>

    <section className="inspiration-section" id="explore" aria-labelledby="inspiration-title">
      <div className="inspiration-heading"><div><p className="creator-eyebrow">A LITTLE INSPIRATION</p><h2 id="inspiration-title">Find your next starting point.</h2></div><span>Original sample artwork · not generated videos</span></div>
      <div className="inspiration-filters" role="group" aria-label="Inspiration category">{exampleCategories.map((item) => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className="inspiration-grid" aria-live="polite">{filterCreationExamples(category).map((example) => <article className={`inspiration-card inspiration-${example.id}`} key={example.id}>
        <div className="inspiration-image"><Image src={example.image} alt={example.alt} width={example.id === 'alpine-escape' ? 1536 : 1086} height={example.id === 'alpine-escape' ? 1024 : 1448} sizes="(max-width: 700px) 100vw, (max-width: 1000px) 50vw, 33vw" loading="eager" /><span className="sample-tag">Sample artwork</span><span className="sample-category">{example.category}</span></div>
        <div className="inspiration-caption"><div><h3>{example.title}</h3><p>{example.aspectRatio} <span aria-hidden="true">·</span> Prompt inspiration</p></div><button type="button" aria-label={`Use prompt: ${example.title}`} onClick={() => useExample(example)}>Use prompt<MediaIcon name="arrow" /></button></div>
      </article>)}</div>
      <p className="inspiration-note">A starting point, not a promise. Your chosen model and prompt shape the final result.</p>
    </section>
  </main>;
}
