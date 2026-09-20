import { signal } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  Router,
  UrlTree,
} from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { roleGuard } from './role.guard';
import { TokenStoreService } from '../services/token-store.service';
import { Role } from '@shared/enums/role.enum';

describe('roleGuard', () => {
  let tokenStore: TokenStoreService;
  let router: jasmine.SpyObj<Router>;

  let userRoleSignal: ReturnType<typeof signal<string | null>>;

  function createTokenStore(role: string | null) {
    userRoleSignal = signal<string | null>(role);

    return {
      accessToken: signal<string | null>(null),
      userRole: userRoleSignal,
      setSession: jasmine.createSpy('setSession'),
      clear: jasmine.createSpy('clear'),
      isAuthenticated: jasmine
        .createSpy('isAuthenticated')
        .and.returnValue(true),
    } as unknown as TokenStoreService;
  }

  function createRoute(
    roles?: string[],
  ): ActivatedRouteSnapshot {
    return {
      data: roles ? { roles } : {},
    } as ActivatedRouteSnapshot;
  }

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>(
      'Router',
      ['createUrlTree'],
    );

    tokenStore = createTokenStore(null);

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

  it('should allow access when user has an allowed role', () => {
    tokenStore = createTokenStore(Role.PATIENT);

    TestBed.resetTestingModule();

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

    const route = createRoute([Role.PATIENT]);

    const result = TestBed.runInInjectionContext(() =>
      roleGuard(route, {} as never),
    );

    expect(result).toBeTrue();
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('should redirect to 403 when user has a different role', () => {
    tokenStore = createTokenStore(Role.PATIENT);

    TestBed.resetTestingModule();

    const forbiddenUrlTree = {} as UrlTree;

    router.createUrlTree.and.returnValue(forbiddenUrlTree);

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

    const route = createRoute([Role.DOCTOR]);

    const result = TestBed.runInInjectionContext(() =>
      roleGuard(route, {} as never),
    );

    expect(result).toBe(forbiddenUrlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/403']);
  });

  it('should allow access when route has no role restriction', () => {
    tokenStore = createTokenStore(Role.PATIENT);

    TestBed.resetTestingModule();

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

    const route = createRoute();

    const result = TestBed.runInInjectionContext(() =>
      roleGuard(route, {} as never),
    );

    expect(result).toBeTrue();
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('should redirect to 403 when user role is null', () => {
    tokenStore = createTokenStore(null);

    TestBed.resetTestingModule();

    const forbiddenUrlTree = {} as UrlTree;

    router.createUrlTree.and.returnValue(forbiddenUrlTree);

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

    const route = createRoute([Role.PATIENT]);

    const result = TestBed.runInInjectionContext(() =>
      roleGuard(route, {} as never),
    );

    expect(result).toBe(forbiddenUrlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/403']);
  });
});