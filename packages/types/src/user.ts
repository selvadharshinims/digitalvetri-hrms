import type { Role, UserStatus } from './enums';

export interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  whatsapp_enabled: boolean;
  role: Role;
  photo_url: string | null;
  dob: string | null;
  address: string | null;
  college: string | null;
  degree: string | null;
  year_of_study: string | null;
  department: string | null;
  internship_role: string | null;
  joining_date: string | null;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateUserRequest {
  full_name: string;
  email: string;
  phone?: string;
  whatsapp_enabled?: boolean;
  role: Role;
  college?: string;
  degree?: string;
  year_of_study?: string;
  department?: string;
  internship_role?: string;
  joining_date?: string;
  team_ids?: string[];
}

export interface UpdateUserRequest extends Partial<CreateUserRequest> {
  status?: UserStatus;
  photo_url?: string;
}

export interface UserSummary {
  user_id: string;
  full_name?: string;
  joining_date: string | null;
  teams: { id: string; name: string }[];
  projects_contributed: number;
  leads_converted: number;
  tasks_completed: number;
  avg_score: number | null;
}

export interface UserListItem extends User {
  memberships: { team_id: string; is_primary: boolean }[];
}

export interface UserDetail extends User {
  memberships: {
    team_id: string;
    is_primary: boolean;
    joined_at: string;
    team: { id: string; name: string };
  }[];
  led_teams: { id: string; name: string }[];
}

export interface CreateUserResponse {
  user: User;
  /**
   * Fallback temporary password. The user can sign in with this directly if
   * the invite email never lands or they prefer not to use the link.
   */
  temp_password: string;
  /** URL the user clicks to set their own password. */
  invite_url: string;
  /** ISO timestamp after which the invite link stops working. */
  invite_expires_at: string;
}

export interface InviteUserResponse {
  invite_url: string;
  invite_expires_at: string;
}
