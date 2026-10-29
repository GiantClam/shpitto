import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {creationExamples, exampleCategories, filterCreationExamples} from '../../src/components/creation/examples.ts';

test('inspiration filters show reusable original samples, not fake generated videos', () => {
  assert.ok(creationExamples.length >= 3);
  assert.equal(new Set(creationExamples.map((item) => item.id)).size, creationExamples.length);
  assert.deepEqual(filterCreationExamples('All'), creationExamples);
  for (const category of exampleCategories) {
    const examples = filterCreationExamples(category);
    assert.ok(examples.length > 0);
    assert.ok(examples.every((example) => category === 'All' || example.category === category));
  }
  for (const example of creationExamples) {
    assert.ok(existsSync(`public${example.image}`));
    assert.ok(example.prompt.length > 40 && example.prompt.length <= 10000);
    assert.ok(example.alt.length > 20);
    assert.ok(['16:9', '9:16'].includes(example.aspectRatio));
  }
});

test('public entry is a creation surface, with deliberate authenticated handoff', () => {
  const page = readFileSync('src/app/(marketing)/page.tsx', 'utf8');
  const home = readFileSync('src/components/creation/creator-home.tsx', 'utf8');
  assert.match(page, /variant="creator"/);
  assert.match(home, /<textarea/);
  assert.match(home, /Text to video/);
  assert.match(home, /Image to video/);
  assert.match(home, /saveCreationDraft/);
  assert.match(home, /sessionStorage/);
  assert.match(home, /Sample artwork/);
  assert.match(home, /Use prompt/);
  assert.doesNotMatch(home, /fetch\(|quoteHash|inputAssetId|<video|autoPlay|localStorage/);
  assert.doesNotMatch(page, /marketing-hero|Big ideas/);
});

test('prompt reuse preserves settings and mode changes keep the URL in sync', () => {
  const home = readFileSync('src/components/creation/creator-home.tsx', 'utf8');
  const presetAction = home.split('function useExample(')[1].split('function continueToStudio')[0];
  assert.match(presetAction, /setPrompt\(example.prompt\)/);
  assert.doesNotMatch(presetAction, /setMode|setAspectRatio/);
  const modeAction = home.split('function chooseMode(')[1].split('function useExample')[0];
  assert.match(modeAction, /router.replace/);
  assert.match(modeAction, /scroll: false/);
});

test('video studio exposes input mode directly and limits models to the selected mode', () => {
  const panel = readFileSync('src/app/(app)/dashboard/generation-panel.tsx', 'utf8');
  assert.match(panel, /role="group" aria-label="Video creation mode"/);
  assert.match(panel, /aria-pressed=\{selectedMode === 'text-to-video'\}/);
  assert.match(panel, /aria-pressed=\{selectedMode === 'image-to-video'\}/);
  assert.match(panel, /generationChoicesForMode\(choices, selectedMode\)/);
  assert.match(panel, /modeChoices\.map/);
  assert.match(panel, /setCrop\(null\)/);
  assert.match(panel, /No admitted \{selectedMode === 'image-to-video'/);
});
