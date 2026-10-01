import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  ValidationPipe,
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  Request,
  Response,
  NextFunction,
  json,
  urlencoded,
  static as serveStatic,
} from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { existsSync } from 'fs';
import { AppModule } from './app.module';
import { RealtimeService } from './space/realtime.service';
import { PrismaService } from './prisma/prisma.service';
@Catch()
class SafeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      res.status(error.getStatus()).json(error.getResponse());
      return;
    }
    new Logger('API').error(
      error instanceof Error ? error.name : 'Unknown error',
    );
    res
      .status(500)
      .json({ message: '処理に失敗しました。時間をおいて再度お試しください' });
  }
}
async function bootstrap() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters');
  const port = Number(process.env.PORT || 4000),
    origin = process.env.APP_ORIGIN || `http://localhost:${port}`;
  const parsedOrigin = new URL(origin);
  if (
    parsedOrigin.origin !== origin ||
    !['http:', 'https:'].includes(parsedOrigin.protocol)
  )
    throw new Error(
      'APP_ORIGIN must be an exact HTTP(S) origin without a trailing slash or path',
    );
  if (
    process.env.NODE_ENV === 'production' &&
    parsedOrigin.protocol !== 'https:'
  )
    throw new Error('Production requires an HTTPS APP_ORIGIN');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'"],
          'connect-src': ["'self'", origin, origin.replace(/^http/, 'ws')],
          'img-src': ["'self'", 'data:'],
          'upgrade-insecure-requests':
            process.env.NODE_ENV === 'production' ? [] : null,
        },
      },
      strictTransportSecurity:
        process.env.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.use(
    cookieParser(),
    json({ limit: '32kb' }),
    urlencoded({ extended: false, limit: '32kb' }),
  );
  app.enableCors({ origin, credentials: true });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== origin
    ) {
      res.status(403).json({ message: 'Origin not allowed' });
      return;
    }
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      res.status(403).end();
      return;
    }
    if (!req.path.startsWith('/assets/'))
      res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    ['/auth/register', '/auth/login'],
    rateLimit({
      windowMs: 15 * 60000,
      limit: 60,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: '試行回数が多いため、15分後にお試しください' },
    }),
  );
  app.use(
    [
      '/auth',
      '/space',
      '/posts',
      '/comments',
      '/likes',
      '/follow',
      '/notifications',
      '/users',
    ],
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new SafeErrors());
  app.enableShutdownHooks();
  const express = app.getHttpAdapter().getInstance();
  express.get('/health', async (_req: Request, res: Response) => {
    try {
      await app.get(PrismaService).$queryRaw`SELECT 1`;
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  const client = join(process.cwd(), 'dist/client');
  if (existsSync(client)) {
    app.use(
      '/assets',
      serveStatic(join(client, 'assets'), { immutable: true, maxAge: '1y' }),
    );
    app.use(serveStatic(client, { index: 'index.html' }));
  }
  app.get(RealtimeService).attach(app.getHttpServer(), origin);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
