import { IsJWT, IsNotEmpty } from 'class-validator';

export class RefreshDto {
  @IsJWT()
  @IsNotEmpty()
  refresh_token!: string;
}
