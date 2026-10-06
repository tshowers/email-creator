import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import( './features/creator/creator.component' ).then( ( m ) => m.CreatorComponent ),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import( './features/auth-callback/auth-callback.component' ).then( ( m ) => m.AuthCallbackComponent ),
  },
  {
    path: 'help',
    loadComponent: () => import( './features/help/help.component' ).then( ( m ) => m.HelpComponent ),
  },
  {
    path: 'about',
    loadComponent: () => import( './features/about/about.component' ).then( ( m ) => m.AboutComponent ),
  },
  { path: '**', redirectTo: '' },
];
