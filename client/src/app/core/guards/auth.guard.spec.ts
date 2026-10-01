import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';

import { authGuard } from './auth.guard';
import { TokenStoreService } from '../services/token-store.service';

describe('authGuard', () => {
  let tokenStore: jasmine.SpyObj<TokenStoreService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    tokenStore = jasmine.createSpyObj<TokenStoreService>(
      'TokenStoreService',
      ['isAuthenticated'],
    );

    router = jasmine.createSpyObj<Router>(
      'Router',
      ['createUrlTree'],
    );

    TestBed.configureTestingModule({
      providers: [
        {
          provide: TokenStoreService,
          useValue: tokenStore,
        },
        {
          provide: Router,
          useValue: router,
        },
      ],
    });
  });

  it('should allow access when user is authenticated', () => {
    tokenStore.isAuthenticated.and.returnValue(true);

    const result = TestBed.runInInjectionContext(() =>
      authGuard(
        {} as Parameters<typeof authGuard>[0],
        {} as Parameters<typeof authGuard>[1],
      ),
    );

    expect(result).toBeTrue();
    expect(tokenStore.isAuthenticated).toHaveBeenCalled();
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('should redirect to login when user is not authenticated', () => {
    tokenStore.isAuthenticated.and.returnValue(false);

    const loginUrlTree = {} as UrlTree;

    router.createUrlTree.and.returnValue(loginUrlTree);

    const result = TestBed.runInInjectionContext(() =>
      authGuard(
        {} as Parameters<typeof authGuard>[0],
        {} as Parameters<typeof authGuard>[1],
      ),
    );

    expect(result).toBe(loginUrlTree);
    expect(tokenStore.isAuthenticated).toHaveBeenCalled();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});