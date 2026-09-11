import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DevRouteNavComponent } from './shared/dev-route-nav/dev-route-nav.component';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DevRouteNavComponent],
  template: `
    <div class="app-shell">
      <router-outlet></router-outlet>
    </div>
    <app-dev-route-nav></app-dev-route-nav>
  `,
})
export class AppComponent {}
