export interface JwtPayload {
  sub: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  iat?: number;
  exp?: number;
}
