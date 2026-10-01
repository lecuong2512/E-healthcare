import { CanActivateFn, Router } from '@angular/router';
import { TokenStoreService } from '../services/token-store.service';
import { inject } from '@angular/core';

export const authGuard: CanActivateFn = () => {
  const tokenStore = inject(TokenStoreService);
  const router = inject(Router);

  if (tokenStore.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login'])
};
