export type MediaIconName = 'home' | 'video' | 'image' | 'spark' | 'grid' | 'folder' | 'help' | 'arrow';

const paths: Record<MediaIconName, string> = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  video: 'M4 5h12v14H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm12 5 5-3v10l-5-3',
  image: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm-1 13 5-5 5 5 3-3 5 5M15 8h.01',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  grid: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
  folder: 'M3 6h6l2 2h10v12H3V6Z',
  help: 'M9 8a3 3 0 1 1 5 2c-1.5 1-2 1-2 3m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
};

export function MediaIcon({name}: Readonly<{name: MediaIconName}>) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
