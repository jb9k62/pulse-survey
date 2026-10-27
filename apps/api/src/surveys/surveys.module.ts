import { Module } from '@nestjs/common';
import { SummaryService } from './summary.service.js';
import { SurveysController } from './surveys.controller.js';
import { SurveysRepository } from './surveys.repository.js';
import { SurveysService } from './surveys.service.js';

/** Surveys, responses and the weekly summary. All SQL lives in SurveysRepository. */
@Module({
  controllers: [SurveysController],
  providers: [SurveysService, SummaryService, SurveysRepository],
})
export class SurveysModule {}
