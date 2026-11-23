import { Module, type DynamicModule } from '@nestjs/common';
import { EvidenceController, EVIDENCE_REPOSITORY } from './evidence.controller';
import type { EvidenceRepository } from './evidence.repository';

/** Real mode only, and only together with AuthModule (its guards come from there). */
@Module({})
export class EvidenceModule {
  static register(repo: EvidenceRepository): DynamicModule {
    return {
      module: EvidenceModule,
      controllers: [EvidenceController],
      providers: [{ provide: EVIDENCE_REPOSITORY, useValue: repo }],
    };
  }
}
