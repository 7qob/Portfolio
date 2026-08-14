import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  /**
   * nginx proxies `/api/` through without stripping it, so the service owns
   * the same paths in development and production. One less thing that can be
   * true locally and false on the Pi.
   */
  app.setGlobalPrefix('api');

  /**
   * Without this, every request appears to come from nginx on 127.0.0.1 and
   * the whole login log is one meaningless address. A number rather than
   * `true`: trusting every hop lets a client forge X-Forwarded-For and choose
   * the IP that gets rate-limited, which is worse than not logging one.
   */
  app.set('trust proxy', config.trustProxyHops);

  // Nothing here is rendered as HTML, so the header is noise — but it is also
  // a free way to not advertise the stack to a scanner.
  app.disable('x-powered-by');

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // drop properties with no DTO rule
      forbidNonWhitelisted: true, // and reject outright if any were sent
      transform: true,
    }),
  );

  // CORS stays off. The only caller is the site on the same origin, and an
  // allowed origin here would undo the CSRF protection the cookie relies on.

  app.enableShutdownHooks();

  await app.listen(config.port, config.host);
  new Logger('Bootstrap').log(
    `Listening on ${config.host}:${config.port} (${config.isProduction ? 'production' : 'development'})`,
  );
}

void bootstrap();
