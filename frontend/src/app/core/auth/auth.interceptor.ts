import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, catchError, filter, finalize, switchMap, take, throwError } from 'rxjs';
import { AuthService } from './auth.service';

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

function addBearer(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
   
  // Skip attaching token to auth endpoints
  if (req.url.includes('/auth/login') || req.url.includes('/auth/refresh')) {
    return next(req);
  }

  const authReq = addBearer(req, auth.accessToken());

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) {
        return throwError(() => error);
      }

      if (!isRefreshing) {
        isRefreshing = true;
        refreshTokenSubject.next(null);

        return auth.refresh().pipe(
          switchMap((res) => {
            refreshTokenSubject.next(res.accessToken);
            return next(addBearer(req, res.accessToken));
          }),
          catchError((refreshErr) => {
            auth.logout(true);
            return throwError(() => refreshErr);
          }),
          finalize(() => {
            isRefreshing = false;
          })
        );
      }

      // Queue concurrent 401 requests until the single refresh completes
      return refreshTokenSubject.pipe(
        filter((token): token is string => token !== null),
        take(1),
        switchMap((newToken) => next(addBearer(req, newToken)))
      );
    })
  );
};