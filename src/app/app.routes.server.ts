import { RenderMode, ServerRoute } from '@angular/ssr';

// Public pages are built ahead of time as static HTML for search engines
// (taliferro-ui/PRODUCT-STANDARD.md, part 4). The home page renders as the
// signed-out version; the browser takes over once it loads.
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'help', renderMode: RenderMode.Prerender },
  { path: 'about', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
