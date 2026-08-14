import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';

/**
 * OWASP's argon2id baseline: 19 MiB, two passes, one lane. The memory cost is
 * the parameter that matters — it is what makes a GPU attack expensive — and
 * 19 MiB per login is nothing for a Pi serving a handful of people.
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * No i/l/1, no o/0. These passwords get read off a screen and typed, or
 * dictated over the phone, and a character pair nobody can tell apart turns
 * into a support conversation.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const GROUPS = 4;
const GROUP_LENGTH = 5;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * False on any error rather than throwing: a malformed hash in the database
 * is a failed login, not a 500 that tells the caller something interesting.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * 20 characters from a 31-symbol alphabet — a shade under 100 bits, which is
 * far past anything that gets brute-forced. Grouped with dashes because a
 * human has to copy this into a message and read it back.
 *
 * randomInt, not Math.random: it is drawn from the CSPRNG and rejection-samples
 * so the distribution stays flat. A modulo of a random byte over 31 symbols
 * would quietly favour the first few letters.
 */
export function generatePassword(): string {
  const groups: string[] = [];

  for (let g = 0; g < GROUPS; g++) {
    let group = '';
    for (let c = 0; c < GROUP_LENGTH; c++) {
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }

  return groups.join('-');
}

/**
 * A hash of a random throwaway, verified against when the username does not
 * exist. Without it, a missing user returns in microseconds while a real one
 * takes the full argon2 cost, and the difference is a reliable oracle for
 * which usernames are real.
 */
let decoyHash: string | undefined;

export async function decoyVerify(plain: string): Promise<void> {
  decoyHash ??= await hashPassword(generatePassword());
  await verifyPassword(decoyHash, plain);
}
