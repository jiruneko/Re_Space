import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
export class RegisterDto {
  @IsString() @MinLength(1) @MaxLength(30) @Matches(/\S/) name: string;
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(10) @MaxLength(72) password: string;
}
