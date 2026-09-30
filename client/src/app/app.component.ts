import { Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { DevRouteNavComponent } from './shared/dev-route-nav/dev-route-nav.component';
import { NavbarComponent } from './shared/components/header/header.component';
import { NotificationToastComponent } from './shared/components/notification-toast/notification-toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DevRouteNavComponent, NavbarComponent, NotificationToastComponent],
  template: `
    <div class="app-shell">
      @if (!isQueueBoard()) {
        <app-navbar></app-navbar>
      }
      <router-outlet></router-outlet>
    </div>
    <app-dev-route-nav></app-dev-route-nav>
    <app-notification-toast></app-notification-toast>
  `,
})
export class AppComponent {
  private readonly router = inject(Router);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects || e.url),
    ),
    { initialValue: this.router.url },
  );

  readonly isQueueBoard = computed(() => {
    const url = this.currentUrl();
    return url ? url.includes('/receptionist/queue-board') : false;
  });
}
