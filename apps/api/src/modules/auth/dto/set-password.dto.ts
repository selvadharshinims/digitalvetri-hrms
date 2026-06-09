import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SetPasswordDto {
  @IsString()
  @IsNotEmpty()
  invite_token!: string;

  @IsString()
  @MinLength(8)
  new_password!: string;
}
