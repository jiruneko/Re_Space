import { Module } from '@nestjs/common';
import { FollowService } from './follow.service';
import { FollowController } from './follow.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [FollowController],
  providers: [FollowService, PrismaService],
})
export class FollowModule {}
