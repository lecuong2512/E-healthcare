import { CanActivateFn, Router } from "@angular/router";
import { TokenStoreService } from "../services/token-store.service";
import { inject } from "@angular/core";

export const roleGuard: CanActivateFn = (route) =>{
    const tokenStore = inject(TokenStoreService);
    const router = inject(Router);

    const allowedRoles = route.data['roles'] as string[] | undefined;
    if (allowedRoles && !allowedRoles.includes(tokenStore.userRole() ?? '')){
        return router.createUrlTree(['/403'])
    }
    return true;
};