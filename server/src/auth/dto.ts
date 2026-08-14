import { IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  /**
   * Bounded, but not pattern-checked. A login attempt against a username that
   * could never exist is still worth recording — that is what tells you
   * someone is probing rather than mistyping.
   */
  @IsString()
  @Length(1, 64)
  username!: string;

  /**
   * The upper bound is the point: argon2 hashes whatever it is given, so an
   * unbounded field lets anyone spend the server's memory 19 MiB at a time.
   */
  @IsString()
  @Length(1, 200)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(1, 200)
  currentPassword!: string;

  /**
   * Twelve characters minimum and no composition rules. Forcing a symbol and
   * a digit reliably produces "Password1!" — length is what actually costs an
   * attacker anything, so that is the only thing required.
   */
  @IsString()
  @Length(12, 200)
  @Matches(/^\S(.*\S)?$/, { message: 'Password must not start or end with whitespace.' })
  newPassword!: string;
}
