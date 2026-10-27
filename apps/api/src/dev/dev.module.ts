import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DevController } from './dev.controller.js';
import { DevService } from './dev.service.js';

/** The development sign-in picker. Every route is `@DevOnly()`, so a 404 unless dev. */
@Module({
  imports: [AuthModule],
  controllers: [DevController],
  providers: [DevService],
})
export class DevModule {}
