import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { roleGuard } from './role.guard';
import { AuthService } from './auth.service';
/**
 * Verifies that unauthorized roles cannot bypass route protection.
 */
describe('roleGuard', () => {
  let router: Router;
  let authMock: {
    isAuthenticated: ReturnType<typeof vi.fn>;
    hasRole: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authMock = {
      isAuthenticated: vi.fn(),
      hasRole: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
      ],
    });

    router = TestBed.inject(Router);
  });

  it('allows access when user has an authorized role', () => {
    authMock.isAuthenticated.mockReturnValue(true);
    authMock.hasRole.mockReturnValue(true);

    const guard = roleGuard(['SALES', 'ADMIN']);
    const result = TestBed.runInInjectionContext(() => guard({} as any, {} as any));

    expect(result).toBe(true);
  });

  it('redirects to /dashboard when authenticated user lacks required role', () => {
    authMock.isAuthenticated.mockReturnValue(true);
    authMock.hasRole.mockReturnValue(false);

    const guard = roleGuard(['SALES', 'ADMIN']);
    const result = TestBed.runInInjectionContext(() => guard({} as any, {} as any)) as UrlTree;

    expect(router.serializeUrl(result)).toBe('/dashboard');
  });

  it('redirects to /login when user is not authenticated', () => {
    authMock.isAuthenticated.mockReturnValue(false);

    const guard = roleGuard(['SALES']);
    const result = TestBed.runInInjectionContext(() => guard({} as any, {} as any)) as UrlTree;

    expect(router.serializeUrl(result)).toBe('/login');
  });
});