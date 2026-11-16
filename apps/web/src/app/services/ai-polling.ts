import { defer, exhaustMap, retry, takeWhile, throwError, timer } from 'rxjs';
import type { ApiService } from './api.service';

export function watchAiJob(api: ApiService, id: string, onRetry: () => void) {
  return timer(0, 3000).pipe(
    exhaustMap(() => defer(() => api.getAiJob(id)).pipe(retry({
      delay: (error, count) => {
        if (error.status > 0 && error.status < 500 && error.status !== 429) return throwError(() => error);
        onRetry();
        return timer(Math.min(30000, 1000 * 2 ** Math.min(count, 5)));
      },
    }))),
    takeWhile(job => !['COMPLETED', 'FAILED', 'EXPIRED'].includes(job.state), true),
  );
}
