import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthGuard, RequestIdMiddleware } from './common/auth';
import { AllExceptionsFilter } from './common/errors';
import { AiController } from './modules/ai.controller';
import { AccountsAdminController, AuthController } from './modules/auth.controller';
import { CallsController } from './modules/calls.controller';
import { CouncilsController } from './modules/councils.controller';
import { AuditController, DashboardController } from './modules/dashboard.controller';
import { DocumentsController } from './modules/documents.controller';
import { HealthController } from './modules/health.controller';
import { IntegrationsController } from './modules/integrations.controller';
import { JobsController } from './modules/jobs.controller';
import { MeController } from './modules/me.controller';
import { OrgController } from './modules/org.controller';
import { ProjectsController } from './modules/projects.controller';
import { ProposalsController } from './modules/proposals.controller';
import { PublicationsController } from './modules/publications.controller';
import { RegulationsController } from './modules/regulations.controller';
import { AdminExtController } from './modules/admin-ext.controller';
import { AnalyticsController } from './modules/analytics.controller';
import { ExportsController } from './modules/exports.controller';
import { FinanceController } from './modules/finance.controller';
import { PublicationsExtController } from './modules/publications-ext.controller';
import { RegistryController } from './modules/registry.controller';
import { ResearchersController } from './modules/researchers.controller';
import { HemisDataController, StudentResearchController } from './modules/student.controller';

@Module({
  controllers: [
    HealthController,
    AuthController,
    AccountsAdminController,
    JobsController,
    MeController,
    OrgController,
    CallsController,
    ProposalsController,
    ProjectsController,
    PublicationsController,
    DocumentsController,
    DashboardController,
    AuditController,
    AiController,
    IntegrationsController,
    CouncilsController,
    RegulationsController,
    RegistryController,
    FinanceController,
    HemisDataController,
    StudentResearchController,
    PublicationsExtController,
    ResearchersController,
    AdminExtController,
    AnalyticsController,
    ExportsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
