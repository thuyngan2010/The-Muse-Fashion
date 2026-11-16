import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class FeatureScaffoldService {
  pending(capability: string): never {
    throw new NotImplementedException({
      code: 'FEATURE_NOT_IMPLEMENTED',
      message: `${capability} is scaffolded but not implemented`,
    });
  }
}
