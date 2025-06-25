// src/app.module.ts
import { PostModule } from './post/post.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationModule } from './notification/notification.module';
import { AuthModule } from './auth/auth.module';
import { LikeModule } from './likes/like.module';
import { PrismaModule } from './prisma/prisma.module';
import { FollowModule } from './follow/follow.module';
import { User } from './user/entities/user.entity';
import { Notification } from './notification/entities/notification.entity';
import { Post } from './post/entities/post.entity';
import { Comment } from './comment/entities/comment.entity';
import { CommentModule } from './comment/comment.module';
import { UserModule } from './user/user.module';


@Module({
  imports: [
    CommentModule,
    PostModule,
    LikeModule,
    FollowModule,
    UserModule,
    TypeOrmModule.forRoot({
      type: 'sqlite', // または 'mysql' / 'postgres'
      database: 'dev.db',
      entities: [User, Notification, Post, Comment],
      synchronize: true, // 開発中は true、運用は false に
    }),
    TypeOrmModule.forFeature([User, Notification, Post, Comment]), // 👈 Repository注入のために必要
    PrismaModule, // 👈 PrismaService使ってるので必要
    AuthModule, // 👈 ★ここがないと /auth/login は使えない！
    NotificationModule, // 他のモジュールもここで読み込む
  ],
})
export class AppModule {}
