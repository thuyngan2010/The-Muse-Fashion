import { Global, Module } from '@nestjs/common';
import { FeatureScaffoldService } from './feature-scaffold.service.js';

@Global()
@Module({ providers: [FeatureScaffoldService], exports: [FeatureScaffoldService] })
export class ScaffoldModule {}
