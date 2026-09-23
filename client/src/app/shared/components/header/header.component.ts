import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-navbar',
  standalone: true,
  template: `
  <header
  class="sticky z-40 w-full border-b top-0"
  style="background-color: #ffffff; border-color: #e2e8f0"
>
  <div
    class="max-w-screen-xl mx-auto px-4 lg:px-6 h-14 flex items-center justify-between gap-3 lg:gap-6"
  >
    <!-- Logo -->
    <div class="flex items-center gap-2 shrink-0">
      <div
        class="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
      >
        <img
          [src]="logo"
          alt="Logo"
          class="w-full h-full object-contain"
        />
      </div>

      <span
        class="font-semibold text-base"
        style="color: #0f172a"
      >
        E-Healthcare
      </span>

      <span
        class="text-xs font-medium px-2 py-0.5 rounded"
        style="background-color: #e0f2fe; color: #0284c7"
      >
        Medical
      </span>
    </div>
  </div>
</header>`,
//   styleUrl: './navbar.component.scss',
})
export class NavbarComponent {
  readonly logo = 'assets/logo.png';


}