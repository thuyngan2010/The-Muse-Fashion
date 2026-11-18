import { IsBoolean, IsEmail, IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(100) fullName!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(12) @MaxLength(128) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, { message: 'Password requires uppercase, lowercase and digit' }) password!: string;
}

export class LoginDto {
  @IsOptional() @IsBoolean() remember?: boolean;
  @IsEmail() email!: string;
  @IsString() password!: string;
}

export class VerifyEmailDto {
  @IsString() @MinLength(32) token!: string;
}

export class RegistrationStatusQueryDto {
  @IsString() @MaxLength(2048) token!: string;
}

export class GoogleLoginDto {
  @IsString() @MinLength(20) @MaxLength(4096) credential!: string;
  @IsOptional() @IsBoolean() remember?: boolean;
}

export class ResendVerificationDto {
  @IsEmail() email!: string;
}

export class ForgotPasswordDto {
  @IsEmail() email!: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(32) token!: string;
  @IsString() @MinLength(12) @MaxLength(128) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, { message: 'Password requires uppercase, lowercase and digit' }) newPassword!: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128) currentPassword!: string;
  @IsString() @MinLength(12) @MaxLength(128) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, { message: 'Password requires uppercase, lowercase and digit' }) newPassword!: string;
}
