import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateOrganisationDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  // Frontend sends: number_of_teachers (string from form)
  @IsOptional()
  @IsString()
  number_of_teachers?: string;

  // Frontend sends: organization_type
  @IsOptional()
  @IsString()
  organization_type?: string;

  @IsOptional()
  @IsString()
  user_id?: string;
}
