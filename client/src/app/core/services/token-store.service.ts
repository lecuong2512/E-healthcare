import { Injectable, signal } from '@angular/core';
import { CurrentUser } from '@shared/interfaces';

export type UserProfileInfo = CurrentUser & {
  avatarUrl?: string | null;
};

@Injectable({ providedIn: 'root' })
export class TokenStoreService {
  private readonly _accessToken = signal<string | null>(null);
  private readonly _userRole = signal<string | null>(this.readSavedUser()?.role ?? null);
  private readonly _currentUser = signal<UserProfileInfo | null>(this.readSavedUser());

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
    if (user) {
      this._currentUser.set(user);
      try {
        localStorage.setItem('currentUser', JSON.stringify(user));
      } catch {}
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
