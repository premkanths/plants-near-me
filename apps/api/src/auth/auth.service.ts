import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuthResponse, AuthTokens, AuthUserView, JwtPayload, RefreshPayload } from './auth.types';
import { LoginDto, RegisterCustomerDto, RegisterVendorDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;

/**
 * Refresh tokens are hashed with SHA-256 rather than bcrypt.
 * bcrypt silently truncates its input at 72 bytes, and two JWTs issued for the
 * same user share a much longer prefix than that — so bcrypt would consider a
 * rotated token equal to the one it replaced, defeating reuse detection.
 * A JWT already carries ~256 bits of entropy, so a fast one-way hash is the
 * right primitive here (it only needs to protect tokens at rest).
 */
function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function refreshTokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashRefreshToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // ───────────────────────────── registration ─────────────────────────────

  async registerCustomer(dto: RegisterCustomerDto): Promise<AuthResponse> {
    await this.assertEmailAvailable(dto.email);

    const user = await this.prisma.user.create({
      data: {
        email: this.normaliseEmail(dto.email),
        passwordHash: await hash(dto.password, BCRYPT_ROUNDS),
        name: dto.name.trim(),
        phone: dto.phone,
        role: 'CUSTOMER',
        cart: { create: {} }, // every customer owns exactly one cart
      },
    });

    return this.issueSession(user.id);
  }

  /**
   * Creates the user *and* their vendor profile in one transaction.
   * The profile always starts with `approved: false` — an admin must approve it
   * (Step 11) before the vendor becomes visible in search results.
   */
  async registerVendor(dto: RegisterVendorDto): Promise<AuthResponse> {
    await this.assertEmailAvailable(dto.email);

    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);
    const slug = await this.uniqueVendorSlug(dto.vendor.name);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: this.normaliseEmail(dto.email),
          passwordHash,
          name: dto.name.trim(),
          phone: dto.phone,
          role: 'VENDOR',
        },
      });

      await tx.vendor.create({
        data: {
          userId: created.id,
          name: dto.vendor.name.trim(),
          slug,
          description: dto.vendor.description,
          phone: dto.phone,
          addressLine: dto.vendor.addressLine,
          city: dto.vendor.city ?? 'Bengaluru',
          pincode: dto.vendor.pincode,
          latitude: dto.vendor.latitude,
          longitude: dto.vendor.longitude,
          deliveryRadiusKm: dto.vendor.deliveryRadiusKm ?? 5,
          approved: false, // ← awaits admin approval
        },
      });

      return created;
    });

    this.logger.log(`Vendor registered and pending approval: ${slug}`);
    return this.issueSession(user.id);
  }

  // ───────────────────────────── session ─────────────────────────────

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: this.normaliseEmail(dto.email) },
    });

    // Compare against a dummy hash when the user does not exist so that the
    // response time does not reveal whether an email is registered.
    const passwordHash =
      user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const passwordMatches = await compare(dto.password, passwordHash);

    if (!user || !passwordMatches) throw new UnauthorizedException('Invalid email or password');
    if (!user.isActive) throw new UnauthorizedException('This account has been suspended');

    return this.issueSession(user.id);
  }

  /** Rotating refresh: the old token is invalidated as soon as a new one is issued. */
  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.refreshTokenHash || !user.isActive) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    if (!refreshTokenMatches(refreshToken, user.refreshTokenHash)) {
      // Token reuse: drop the stored session so the (possibly stolen) token dies.
      await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: null } });
      throw new UnauthorizedException('Refresh token has already been used');
    }

    return this.issueSession(user.id);
  }

  async logout(userId: string): Promise<{ success: true }> {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
    return { success: true };
  }

  async me(userId: string): Promise<AuthUserView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { vendor: { select: { id: true, name: true, slug: true, approved: true } } },
    });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return this.toUserView(user);
  }

  // ───────────────────────────── internals ─────────────────────────────

  private async issueSession(userId: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { vendor: { select: { id: true, name: true, slug: true, approved: true } } },
    });

    const tokens = await this.signTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
      vendorId: user.vendor?.id,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: hashRefreshToken(tokens.refreshToken) },
    });

    return { ...tokens, user: this.toUserView(user) };
  }

  private async signTokens(payload: JwtPayload): Promise<AuthTokens> {
    // Expressed in seconds so the value is unambiguous for both jsonwebtoken and clients.
    const accessTtl = this.ttlToSeconds(process.env.JWT_ACCESS_TTL ?? '15m');
    const refreshTtl = this.ttlToSeconds(process.env.JWT_REFRESH_TTL ?? '7d');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: accessTtl,
      }),
      this.jwt.signAsync(
        { sub: payload.sub, tokenVersion: 'v1', jti: randomUUID() } satisfies RefreshPayload,
        {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: refreshTtl,
        },
      ),
    ]);

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  private ttlToSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 900;
    const value = Number(match[1]);
    const unit = { s: 1, m: 60, h: 3600, d: 86400 }[match[2]] ?? 60;
    return value * unit;
  }

  private toUserView(user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    phone: string | null;
    vendor?: { id: string; name: string; slug: string; approved: boolean } | null;
  }): AuthUserView {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      vendor: user.vendor ?? undefined,
    };
  }

  private normaliseEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { email: this.normaliseEmail(email) },
      select: { id: true },
    });
    if (existing) throw new ConflictException('An account with this email already exists');
  }

  private async uniqueVendorSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'vendor';

    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await this.prisma.vendor.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    return `${base}-${Date.now()}`;
  }
}
