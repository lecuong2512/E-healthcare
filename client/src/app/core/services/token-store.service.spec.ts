import { TestBed } from '@angular/core/testing';
import { TokenStoreService, UserProfileInfo } from './token-store.service';
import { Role } from '@shared/enums';

describe('TokenStoreService', () => {
  let service: TokenStoreService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [TokenStoreService],
    });
    service = TestBed.inject(TokenStoreService);
  });

  afterEach(() => {
    service.clear();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should save user to _currentUser signal and localStorage in setSession', () => {
    const user: UserProfileInfo = {
      fullName: 'Trần Văn Thực',
      email: 'thuctran@example.com',
      phoneNumber: '0988776655',
      role: Role.PATIENT,
      avatarUrl: 'https://example.com/avatar.png',
    };

    service.setSession('access-token-123', Role.PATIENT, user);

    expect(service.accessToken()).toBe('access-token-123');
    expect(service.userRole()).toBe(Role.PATIENT);
    expect(service.currentUser()).toEqual(user);
    expect(service.isAuthenticated()).toBeTrue();

    const stored = localStorage.getItem('currentUser');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual(user);
  });

  it('should restore user via readSavedUser on reload', () => {
    const savedUser: UserProfileInfo = {
      fullName: 'Lê Hoàng Nam',
      email: 'namlh@example.com',
      phoneNumber: '0911223344',
      role: Role.DOCTOR,
    };
    localStorage.setItem('currentUser', JSON.stringify(savedUser));

    const restored = service.readSavedUser();
    expect(restored).toEqual(savedUser);
  });

  it('should clear all session and localStorage state on clear()', () => {
    const user: UserProfileInfo = {
      fullName: 'Phạm Văn Admin',
      role: Role.ADMIN,
    };
    service.setSession('token', Role.ADMIN, user);
    expect(service.currentUser()).not.toBeNull();

    service.clear();

    expect(service.accessToken()).toBeNull();
    expect(service.userRole()).toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBeFalse();
    expect(localStorage.getItem('currentUser')).toBeNull();
  });

  it('should update currentUser and localStorage on setCurrentUser()', () => {
    const user: UserProfileInfo = {
      fullName: 'Nguyễn Lễ Tân',
      role: Role.RECEPTIONIST,
    };

    service.setCurrentUser(user);
    expect(service.currentUser()).toEqual(user);
    expect(localStorage.getItem('currentUser')).toContain('Nguyễn Lễ Tân');

    service.setCurrentUser(null);
    expect(service.currentUser()).toBeNull();
    expect(localStorage.getItem('currentUser')).toBeNull();
  });
});
