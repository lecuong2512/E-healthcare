import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DevRouteNavComponent } from './shared/dev-route-nav/dev-route-nav.component';
import { NavbarComponent } from './shared/components/header/header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DevRouteNavComponent, NavbarComponent],
  template: `
    <div class="app-shell">
      <app-navbar></app-navbar>
      <router-outlet></router-outlet>
    </div>
    <app-dev-route-nav></app-dev-route-nav>
  `,
})
export class AppComponent {}
