import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { UsersService } from './users/users.service';
import type { Role } from './common/types';

/**
 * Bootstrap and recovery, run inside the container:
 *
 *   docker compose exec api node dist/cli.js create-admin <username>
 *   docker compose exec api node dist/cli.js reset-password <username>
 *   docker compose exec api node dist/cli.js list
 *
 * create-admin is the answer to the chicken-and-egg problem: accounts are
 * issued from the admin panel, and reaching the admin panel needs an account.
 * It requires a shell on the Pi, which is the correct bar for the one
 * operation that cannot be authenticated.
 *
 * Passwords are generated, printed once and never stored in plaintext — so
 * they are not in your shell history either, which is where they would end up
 * if this took one as an argument.
 */
async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const users = app.get(UsersService);

  try {
    switch (command) {
      case 'create-admin':
      case 'create-user': {
        const username = args[0];
        if (!username) {
          fail(`Usage: node dist/cli.js ${command} <username> [note]`);
        }

        const role: Role = command === 'create-admin' ? 'admin' : 'user';
        const created = await users.create({
          username,
          role,
          note: args[1] ?? null,
        });

        console.log('');
        console.log(`  Account created: ${created.username}  (${created.role})`);
        console.log('');
        console.log(`  Password: ${created.password}`);
        console.log('');
        console.log('  This is shown once. Only its hash is stored — nobody,');
        console.log('  including you, can read it back out later.');
        console.log('');
        break;
      }

      case 'reset-password': {
        const username = args[0];
        if (!username) fail('Usage: node dist/cli.js reset-password <username>');

        const user = users.findByUsername(username);
        if (!user) fail(`No such user: ${username}`);

        const password = await users.resetPassword(user.id);

        console.log('');
        console.log(`  New password for ${user.username}: ${password}`);
        console.log('');
        console.log('  The old password stopped working immediately.');
        console.log('');
        break;
      }

      case 'list': {
        const all = users.listAll();
        if (all.length === 0) {
          console.log('No accounts yet. Create one with: create-admin <username>');
          break;
        }

        console.log('');
        for (const user of all) {
          const state = user.disabled_at ? 'disabled' : 'active';
          const seen = user.last_login_at ?? 'never';
          console.log(
            `  ${user.username.padEnd(20)} ${user.role.padEnd(6)} ${state.padEnd(9)} last login: ${seen}`,
          );
        }
        console.log('');
        break;
      }

      default:
        console.log('Commands: create-admin <username> [note]');
        console.log('          create-user  <username> [note]');
        console.log('          reset-password <username>');
        console.log('          list');
        process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
