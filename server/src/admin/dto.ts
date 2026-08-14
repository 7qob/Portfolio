import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

/** Shared paging. The cap is the point — no caller gets to ask for everything. */
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}

export class CreateUserDto {
  @IsString()
  @Length(3, 32)
  username!: string;

  @IsIn(['user', 'admin'])
  role!: 'user' | 'admin';

  @IsOptional()
  @IsString()
  @Length(0, 100)
  displayName?: string;

  /** Who this login was issued to, e.g. the company it went to. */
  @IsOptional()
  @IsString()
  @Length(0, 200)
  note?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @IsOptional()
  @IsIn(['user', 'admin'])
  role?: 'user' | 'admin';

  @IsOptional()
  @IsString()
  @Length(0, 200)
  note?: string;
}

export class UpdateVaultItemDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  /**
   * Editable because a file can be re-uploaded under a different name, but
   * still a bare filename. Uploading is not possible through the panel, so
   * this only ever points at something already placed on the Pi by hand.
   */
  @IsOptional()
  @IsString()
  @Length(1, 120)
  filename?: string;
}
