import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthUser, LoginResponse, RefreshResponse, UserRole } from '../models/auth.model';

const ACCESS_KEY = 'mp_access_token';
const REFRESH_KEY = 'mp_refresh_token';
const USER_KEY = 'mp_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private http: HttpClient, private router: Router) {}

  // Private writable signals
  private readonly _user = signal<AuthUser | null>(this.loadStoredUser());
  private readonly _accessToken = signal<string | null>(sessionStorage.getItem(ACCESS_KEY));
  private readonly _refreshToken = signal<string | null>(sessionStorage.getItem(REFRESH_KEY));

  // Public readonly & computed signals
  readonly user = this._user.asReadonly();
  readonly accessToken = this._accessToken.asReadonly();
  readonly isAuthenticated = computed(() => !!this._accessToken() && !!this._user());
  readonly role = computed(() => this._user()?.role ?? null);
  readonly isSales = computed(() => this.role() === 'SALES');
  readonly isReviewer = computed(() => this.role() === 'REVIEWER');
  readonly isAdmin = computed(() => this.role() === 'ADMIN');

  hasRole(roles: UserRole[]): boolean {
    const current = this.role();
    return current !== null && roles.includes(current);
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(
        tap((res) => {
          this.setTokens(res.accessToken, res.refreshToken);
          this._user.set(res.user);
          sessionStorage.setItem(USER_KEY, JSON.stringify(res.user));
        })
      );
  }

  refresh(): Observable<RefreshResponse> {
    const refreshToken = this._refreshToken();
    return this.http
      .post<RefreshResponse>(`${environment.apiUrl}/auth/refresh`, { refreshToken })
      .pipe(tap((res) => this.setTokens(res.accessToken, res.refreshToken)));
  }

  logout(redirect = true): void {
    const refreshToken = this._refreshToken();
    if (refreshToken) {
      this.http.post(`${environment.apiUrl}/auth/logout`, { refreshToken }).subscribe({
        error: () => {}, // Ignore network errors on logout
      });
    }
    this.clearSession();
    if (redirect) {
      this.router.navigate(['/login']);
    }
  }

  private setTokens(access: string, refresh: string): void {
    this._accessToken.set(access);
    this._refreshToken.set(refresh);
    sessionStorage.setItem(ACCESS_KEY, access);
    sessionStorage.setItem(REFRESH_KEY, refresh);
  }

  private clearSession(): void {
    this._accessToken.set(null);
    this._refreshToken.set(null);
    this._user.set(null);
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(USER_KEY);
  }

  private loadStoredUser(): AuthUser | null {
    try {
      const raw = sessionStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }
}