import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthResponse, AuthUserView } from './auth.types';
import { CurrentUser, Public, Roles } from './decorators';
import { LoginDto, RefreshDto, RegisterCustomerDto, RegisterVendorDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterCustomerDto): Promise<AuthResponse> {
    return this.authService.registerCustomer(dto);
  }

  @Public()
  @Post('register/vendor')
  registerVendor(@Body() dto: RegisterVendorDto): Promise<AuthResponse> {
    return this.authService.registerVendor(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto): Promise<AuthResponse> {
    return this.authService.refresh(dto.refreshToken);
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@CurrentUser('id') userId: string): Promise<{ success: true }> {
    return this.authService.logout(userId);
  }

  @Get('me')
  me(@CurrentUser('id') userId: string): Promise<AuthUserView> {
    return this.authService.me(userId);
  }

  /** Smoke-test endpoints proving the role guard works end to end. */
  @Roles('VENDOR')
  @Get('vendor-only')
  vendorOnly(@CurrentUser('vendorId') vendorId?: string): { ok: true; vendorId?: string } {
    return { ok: true, vendorId };
  }

  @Roles('ADMIN')
  @Get('admin-only')
  adminOnly(): { ok: true } {
    return { ok: true };
  }
}
