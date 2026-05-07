import jwt, { type SignOptions } from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { env } from '../config/env.js';

export type Role = 'owner' | 'shop_seller' | 'factory_sender';
export type JwtPayload = { sub: number; role: Role; jti: string };

export function signJwt(payload: Omit<JwtPayload, 'jti'>): { token: string; jti: string } {
  const jti = uuid();
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  const token = jwt.sign({ ...payload, jti }, env.JWT_SECRET, options);
  return { token, jti };
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as unknown as JwtPayload;
}
