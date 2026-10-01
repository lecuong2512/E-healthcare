import { Injectable, signal } from '@angular/core';
import { CurrentUser } from '@shared/interfaces';

export type UserProfileInfo = CurrentUser & {
  avatarUrl?: string | null;
};

@Injectable({ providedIn: 'root' })
export class TokenStoreService {
  private readonly _accessToken = signal<string | null>(null);
  private readonly _userRole = signal<string | null>(null);
  private readonly _currentUser = signal<UserProfileInfo | null>(null);

  readonly accessToken = this._accessToken.asReadonly();
  readonly userRole = this._userRole.asReadonly();
  readonly currentUser = this._currentUser.asReadonly();

  readSavedUser(): UserProfileInfo | null {
    try {
      const saved = localStorage.getItem('currentUser');
      return saved ? (JSON.parse(saved) as UserProfileInfo) : null;
    } catch {
      return null;
    }
  }

  setSession(accessToken: string, role: string, user?: UserProfileInfo): void {
    this._accessToken.set(accessToken);
    this._userRole.set(role);
    const resolvedUser = user ?? this.readSavedUser();
    if (resolvedUser) {
      const userWithRole = { ...resolvedUser, role };
      this._currentUser.set(userWithRole);
      try {
        localStorage.setItem('currentUser', JSON.stringify(userWithRole));
      } catch {}
    } else {
      this._currentUser.set(null);
    }
  }

  setCurrentUser(user: UserProfileInfo | null): void {
    this._currentUser.set(user);
    try {
      if (user) {
        localStorage.setItem('currentUser', JSON.stringify(user));
      } else {
        localStorage.removeItem('currentUser');
      }
    } catch {}
  }

  clear(): void {
    this._accessToken.set(null);
    this._userRole.set(null);
    this._currentUser.set(null);
    try {
      localStorage.removeItem('currentUser');
    } catch {}
  }

  isAuthenticated(): boolean {
    return this._accessToken() !== null;
  }
}
