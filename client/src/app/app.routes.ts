import { Routes } from '@angular/router';
import { AppShell } from './layout/app-shell/app-shell/app-shell';
import { AskPage } from './features/ask/pages/ask-page/ask-page';
import { SourcesPage } from './features/sources/pages/sources-page/sources-page';

export const routes: Routes = [
  {
    path: '',
    component: AppShell,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'ask',
      },
      {
        path: 'ask',
        component: AskPage,
      },
      {
        path: 'sources',
        component: SourcesPage,
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'ask',
  },
];