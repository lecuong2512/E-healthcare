import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink],
  standalone: true,
  template: `
  <header class="sticky top-0 z-40 w-full border-b border-slate-200 bg-white">
  <div class="w-full mx-auto px-4 lg:px-6 h-14 flex items-center justify-between gap-3 lg:gap-6">
    <!-- Logo -->
    <a 
      routerLink="/" 
      class="inline-flex items-center gap-2 shrink-0 ml-1 cursor-pointer transition-opacity hover:opacity-90"
    >
      <div class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm">
        <img
          [src]="logo"
          alt="E-Healthcare Logo"
          class="w-full h-full object-contain"
        />
      </div>

      <span class="font-semibold text-base text-slate-900">
        E-Healthcare
      </span>

      <span class="text-xs font-medium px-2 py-0.5 rounded bg-sky-100 text-sky-600">
        Medical
      </span>
    </a>
  </div>
</header>`,
//   styleUrl: './navbar.component.scss',
})
export class NavbarComponent {
  readonly logo = 'assets/logo.png';


}