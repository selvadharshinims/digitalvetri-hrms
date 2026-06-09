export interface Team {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  leader_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  is_primary: boolean;
  joined_at: string;
}

export interface CreateTeamRequest {
  name: string;
  description?: string;
  category?: string;
  leader_id?: string;
}

export interface UpdateTeamRequest extends Partial<CreateTeamRequest> {
  is_active?: boolean;
}

export interface AddTeamMemberRequest {
  user_id: string;
  is_primary?: boolean;
}

export interface TeamLeaderboardEntry {
  rank: number;
  user_id: string;
  full_name: string;
  total_score: number | null;
}

export interface TeamListItem extends Team {
  leader: { id: string; full_name: string; email: string } | null;
  _count: { members: number; projects: number };
}

export interface TeamMemberDetail {
  id: string;
  is_primary: boolean;
  joined_at: string;
  user: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    status: string;
    photo_url: string | null;
    internship_role: string | null;
  };
}

export interface TeamDetail extends Team {
  leader: { id: string; full_name: string; email: string; photo_url: string | null } | null;
  members: TeamMemberDetail[];
  _count: { projects: number };
}
