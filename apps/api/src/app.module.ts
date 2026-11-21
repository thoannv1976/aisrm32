import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthGuard, RequestIdMiddleware } from './common/auth';
import { AllExceptionsFilter } from './common/errors';
import { AiController } from './modules/ai.controller';
import { CallsController } from './modules/calls.controller';
import { CouncilsController } from './modules/councils.controller';
import { AuditController, DashboardController } from './modules/dashboard.controller';
import { DocumentsController } from './modules/documents.controller';
import { HealthController } from './modules/health.controller';
import { IntegrationsController } from './modules/integrations.controller';
import { MeController } from './modules/me.controller';
import { OrgController } from './modules/org.controller';
import { ProjectsController } from './modules/projects.controller';
import { ProposalsController } from './modules/proposals.controller';
import { PublicationsController } from './modules/publications.controller';

@Module({
  controllers: [
    HealthController,
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
