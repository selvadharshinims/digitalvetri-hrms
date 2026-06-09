import { UserStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/**
 * Partial of CreateUserDto with `status` and `photo_url` additions.
 * Field-level permissions (which fields self vs. admin can set) are enforced
 * in the service layer, not by separate DTOs.
 */
export class UpdateUserDto implements Partial<CreateUserDto> {
  @IsOptional() @IsString() @MaxLength(120) full_name?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsBoolean() whatsapp_enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(120) college?: string;
  @IsOptional() @IsString() @MaxLength(120) degree?: string;
  @IsOptional() @IsString() @MaxLength(20) year_of_study?: string;
  @IsOptional() @IsString() @MaxLength(60) department?: string;
  @IsOptional() @IsString() @MaxLength(80) internship_role?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsUrl({ require_tld: false })
  photo_url?: string;
}
