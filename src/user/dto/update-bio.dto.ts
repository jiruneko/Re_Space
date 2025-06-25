import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBioDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;
}