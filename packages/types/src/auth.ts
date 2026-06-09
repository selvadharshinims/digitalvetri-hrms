import type { Role } from './enums';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  access_token_expires_in: number;
}

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  led_team_ids: string[];
  member_team_ids: string[];
}

export interface LoginResponse {
  user: SessionUser;
  tokens: AuthTokens;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface SetPasswordRequest {
  invite_token: string;
  new_password: string;
}
