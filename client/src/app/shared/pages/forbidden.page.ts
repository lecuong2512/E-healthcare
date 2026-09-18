import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-forbidden-page',
  standalone: true,
  imports: [],
  templateUrl: './forbidden.page.html',
  // styleUrl: './page-403.page.scss'
})
export class ForbiddenPage {
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  navigateToLogin(): void {
    this.router.navigate(['/login']);
  }

  goBack(): void {
    this.location.back();
  }
}
