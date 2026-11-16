import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { authInterceptor } from './app/services/auth.interceptor';
import { inject, provideAppInitializer } from '@angular/core';
import { AuthService } from './app/services/auth.service';
import { ServerStatusService } from './app/services/server-status.service';
import { switchMap } from 'rxjs';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(() => {
      const serverStatus = inject(ServerStatusService);
      const auth = inject(AuthService);
      return serverStatus.bootstrapCheck().pipe(switchMap(() => auth.initAuth()));
    }),
  ],
}).catch(console.error);
