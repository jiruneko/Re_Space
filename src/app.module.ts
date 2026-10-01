import { Module } from '@nestjs/common';
import { PostModule } from './post/post.module';
import { NotificationModule } from './notification/notification.module';
import { AuthModule } from './auth/auth.module';
import { LikeModule } from './likes/like.module';
import { PrismaModule } from './prisma/prisma.module';
import { FollowModule } from './follow/follow.module';
import { CommentModule } from './comment/comment.module';
import { UserModule } from './user/user.module';
import { SpaceModule } from './space/space.module';
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PostModule,
    CommentModule,
    LikeModule,
    FollowModule,
    UserModule,
    NotificationModule,
    SpaceModule,
  ],
})
export class AppModule {}
