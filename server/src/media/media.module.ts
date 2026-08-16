import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuditService } from '../common/audit.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [MediaService, AuditService],
})
export class MediaModule {}
