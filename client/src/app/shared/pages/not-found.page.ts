// import { Component } from '@angular/core';

// @Component({
//   selector: 'app-not-found-page',
//   standalone: true,
//   template: `<div class="p-6 text-center text-slate-500">404 — Không tìm thấy trang.</div>`,
// })
// export class NotFoundPage {}
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  standalone: true,
  imports: [],
  templateUrl: './not-found.page.html',
  // styleUrl: './page-404.page.scss'
})
export class NotFoundPage {
  private readonly router = inject(Router);

  navigateToHome(): void {
    this.router.navigate(['/patient']);
  }

  navigateToLogin(): void {
    this.router.navigate(['/login']);
  }
}