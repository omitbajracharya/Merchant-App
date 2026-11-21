import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'applications/new',
    canActivate: [roleGuard(['SALES', 'ADMIN'])],
    loadComponent: () =>
      import('./features/application-wizard/application-wizard').then((m) => m.ApplicationWizard),
  },
  {
    path: 'applications/:id/edit',
    canActivate: [roleGuard(['SALES', 'ADMIN'])],
    loadComponent: () =>
      import('./features/application-wizard/application-wizard').then((m) => m.ApplicationWizard),
  },
  {
    path: 'applications/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/application-detail/application-detail').then((m) => m.ApplicationDetail),
  },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' },
];