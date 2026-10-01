import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SpaceController } from './space.controller';
import { RealtimeService } from './realtime.service';
@Module({
  imports: [AuthModule],
  controllers: [SpaceController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class SpaceModule {}
