import { Routes } from '@angular/router';
import { ScepterShellComponent } from './features/scepter-shell/scepter-shell.component';

export const routes: Routes = [
  {
    path: '',
    component: ScepterShellComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];

