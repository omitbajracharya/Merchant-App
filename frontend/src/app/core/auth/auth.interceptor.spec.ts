import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
/**
 * Tests Bearer token attachment and verifies that multiple concurrent 401 responses trigger only ONE POST /auth/refresh call.
 */
describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authMock: {
    accessToken: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authMock = {
      accessToken: vi.fn().mockReturnValue('expired-token'),
      refresh: vi.fn().mockReturnValue(
        of({ accessToken: 'new-valid-token', refreshToken: 'new-refresh-token' })
      ),
      logout: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authMock },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('attaches Bearer token to protected API requests', () => {
    http.get('/api/applications').subscribe();

    const req = httpMock.expectOne('/api/applications');
    expect(req.request.headers.get('Authorization')).toBe('Bearer expired-token');
    req.flush([]);
  });

  it('refreshes token ONLY ONCE when multiple concurrent requests return 401', () => {
    let res1: unknown;
    let res2: unknown;

    http.get('/api/applications?page=1').subscribe((r) => (res1 = r));
    http.get('/api/applications?page=2').subscribe((r) => (res2 = r));

    // Both initial requests fail with 401 concurrently
    const req1 = httpMock.expectOne('/api/applications?page=1');
    const req2 = httpMock.expectOne('/api/applications?page=2');

    req1.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    req2.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    // Only ONE refresh call should have been triggered
    expect(authMock.refresh).toHaveBeenCalledTimes(1);

    // Both requests are retried with the new token
    const retry1 = httpMock.expectOne('/api/applications?page=1');
    const retry2 = httpMock.expectOne('/api/applications?page=2');

    expect(retry1.request.headers.get('Authorization')).toBe('Bearer new-valid-token');
    expect(retry2.request.headers.get('Authorization')).toBe('Bearer new-valid-token');

    retry1.flush({ ok: 1 });
    retry2.flush({ ok: 2 });

    expect(res1).toEqual({ ok: 1 });
    expect(res2).toEqual({ ok: 2 });
  });
});