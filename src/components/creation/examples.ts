export const exampleCategories = ['All', 'Cinematic', 'Product', 'Portrait'] as const;
export type ExampleCategory = typeof exampleCategories[number];
export type CreationExample = Readonly<{
  id: string;
  title: string;
  category: Exclude<ExampleCategory, 'All'>;
  image: string;
  alt: string;
  prompt: string;
  aspectRatio: '16:9' | '9:16';
}>;

export const creationExamples: readonly CreationExample[] = [
  {id: 'after-hours', title: 'After hours in Tokyo', category: 'Portrait', image: '/media/neon-portrait.png', alt: 'A woman in a silver jacket on a rain-soaked street with pink and teal neon lights', prompt: 'An adult woman in a silver jacket turns toward the camera on a rain-soaked Tokyo street. Slow camera push-in, pink and teal reflections, soft background bokeh, cinematic night photography.', aspectRatio: '9:16'},
  {id: 'alpine-escape', title: 'A quieter kind of escape', category: 'Cinematic', image: '/media/alpine-studio.png', alt: 'A warmly lit cabin overlooking an alpine lake and snow-covered mountains at sunrise', prompt: 'A quiet alpine cabin beside a glassy lake at sunrise. The camera drifts slowly across the water toward the cabin, soft morning mist, golden window light, expansive cinematic landscape.', aspectRatio: '16:9'},
  {id: 'in-motion', title: 'Made for the spotlight', category: 'Product', image: '/media/motion-product.png', alt: 'An orange running sneaker suspended above dark stone with water droplets and dramatic rim light', prompt: 'An unbranded orange running sneaker floats above wet black stone. Water droplets rise in slow motion as the camera gently orbits, orange and teal rim light, premium studio product film.', aspectRatio: '9:16'},
];

export function filterCreationExamples(category: ExampleCategory): readonly CreationExample[] {
  return category === 'All' ? creationExamples : creationExamples.filter((example) => example.category === category);
}
