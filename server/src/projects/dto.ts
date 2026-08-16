import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * The slug becomes `project-<slug>.html` on disk, so its alphabet is the
 * page-name regex's alphabet and nothing more. Lowercase letters, digits and
 * inner hyphens — no dots, no slashes, nothing a path could be built from.
 */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export class CreateProjectDto {
  @IsString()
  @Matches(SLUG, { message: 'slug must be lowercase letters, digits and hyphens' })
  slug!: string;

  @IsString()
  @Length(1, 120)
  title!: string;
}

/**
 * PUT replaces the record — the form saves everything it holds in one call.
 * Fields are optional so the endpoint does not force the client to resend
 * what it did not touch; chips and blocks are validated structurally in
 * normalizeChips/normalizeBlocks, which give field-level error messages a
 * decorator cannot.
 */
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @Matches(SLUG, { message: 'slug must be lowercase letters, digits and hyphens' })
  slug?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  title?: string;

  @IsOptional()
  @IsIn(['WIP', 'Featured'])
  status?: string | null;

  @IsOptional()
  @IsIn(['comfy', 'ignite', 'kobui', 'stalkr'])
  palette?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  lede?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  cardBlurb?: string | null;

  @IsOptional()
  @IsArray()
  chips?: unknown;

  @IsOptional()
  @IsArray()
  blocks?: unknown;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}
