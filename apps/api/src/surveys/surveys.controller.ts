import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  createSurveyRequestSchema,
  patchSurveyRequestSchema,
  submitResponseRequestSchema,
  summaryQuerySchema,
  surveyIdSchema,
  type ActiveSurveyPayload,
  type CreateSurveyPayload,
  type CreateSurveyRequest,
  type Organisation,
  type PatchSurveyPayload,
  type PatchSurveyRequest,
  type SubmitResponsePayload,
  type SubmitResponseRequest,
  type Summary,
  type SummaryQuery,
  type SurveyListPayload,
} from '@pulse/contracts';
import {
  CurrentOrg,
  CurrentTx,
  CurrentUser,
  Roles,
} from '../auth/decorators.js';
import type { Principal } from '../auth/sessions.service.js';
import type { TenantTx } from '../db/db.module.js';
import { SummaryService } from './summary.service.js';
import { SurveysService } from './surveys.service.js';

/**
 * No class-level role: `/surveys/active` and the submit are Member routes and the other
 * three are Manager routes, so the role is declared per method. The organisation is never
 * read from a body, query or route parameter; it comes from `@CurrentOrg()`.
 */
@Controller('surveys')
export class SurveysController {
  constructor(
    private readonly surveys: SurveysService,
    private readonly summaryService: SummaryService,
  ) {}

  @Get('active')
  @Roles(['member'])
  async active(
    @CurrentOrg() organisation: Organisation,
    @CurrentUser() user: Principal,
    @CurrentTx() tx: TenantTx,
  ): Promise<ActiveSurveyPayload> {
    return this.surveys.activeForMember(tx, organisation, user.userId);
  }

  @Get()
  @Roles(['manager'])
  async list(
    @CurrentOrg() organisation: Organisation,
    @CurrentTx() tx: TenantTx,
  ): Promise<SurveyListPayload> {
    return this.surveys.list(tx, organisation);
  }

  @Post()
  @Roles(['manager'])
  async create(
    @CurrentOrg() organisation: Organisation,
    @CurrentTx() tx: TenantTx,
    @Body({ schema: createSurveyRequestSchema }) body: CreateSurveyRequest,
  ): Promise<CreateSurveyPayload> {
    return this.surveys.create(tx, organisation, body);
  }

  @Patch(':id')
  @Roles(['manager'])
  async patch(
    @CurrentOrg() organisation: Organisation,
    @CurrentTx() tx: TenantTx,
    @Param('id', { schema: surveyIdSchema }) id: string,
    @Body({ schema: patchSurveyRequestSchema }) body: PatchSurveyRequest,
  ): Promise<PatchSurveyPayload> {
    return this.surveys.patch(tx, organisation, id, body);
  }

  @Post(':id/responses')
  @Roles(['member'])
  async submit(
    @CurrentOrg() organisation: Organisation,
    @CurrentUser() user: Principal,
    @CurrentTx() tx: TenantTx,
    @Param('id', { schema: surveyIdSchema }) id: string,
    @Body({ schema: submitResponseRequestSchema }) body: SubmitResponseRequest,
  ): Promise<SubmitResponsePayload> {
    return this.surveys.submit(tx, organisation, user.userId, id, body);
  }

  @Get(':id/summary')
  @Roles(['manager'])
  async summary(
    @CurrentOrg() organisation: Organisation,
    @CurrentTx() tx: TenantTx,
    @Param('id', { schema: surveyIdSchema }) id: string,
    @Query({ schema: summaryQuerySchema }) query: SummaryQuery,
  ): Promise<Summary> {
    return this.summaryService.summary(tx, organisation, id, query);
  }
}
