import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import type { StaffPermissionName } from '@fashion/contracts';

export const permissionGuard: CanActivateFn = route => {
  const auth = inject(AuthService), router = inject(Router);
  const permission = route.data['permission'] as StaffPermissionName;
  const alternative = route.data['alternativeGlobalPermission'] as StaffPermissionName | undefined;
  return auth.can(permission) || (alternative && auth.canGlobal(alternative)) ? true : router.createUrlTree(['/forbidden']);
};

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  router.navigate(['/auth'], { queryParams: { returnUrl: state.url } });
  return false;
};

export const adminGuard: CanActivateFn = (_route, _state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAdmin()) {
    return true;
  }

  router.navigate(['/']);
  return false;
};

export const staffGuard: CanActivateFn = (_route, _state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isStaff()) {
    return true;
  }

  router.navigate(['/']);
  return false;
};

export const commerceGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.createUrlTree(['/auth'], { queryParams: { returnUrl: state.url } });
  return auth.isCustomer() ? true : router.createUrlTree(['/admin']);
};

export const customerGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() && auth.isCustomer()) {
    return true;
  }

  router.navigate(['/auth'], { queryParams: { returnUrl: state.url } });
  return false;
};
