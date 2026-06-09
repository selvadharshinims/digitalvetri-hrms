import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendTicketMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;
}
