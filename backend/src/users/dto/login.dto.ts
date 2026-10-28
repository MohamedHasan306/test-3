import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'lina@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Str0ngPassword!' })
  @IsString()
  password: string;
}
