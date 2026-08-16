import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuditService } from '../common/audit.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AuthModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, AuditService],
})
export class ProjectsModule {}
