/**
 * Prisma seed — bootstraps a realistic demo cohort so the dashboards have
 * something to show on first run.
 *
 * Idempotent: every entity is upserted by a stable natural key (email, team
 * name, etc.) or skipped when the slot is already populated. Safe to re-run
 * without duplicating data.
 *
 * Contents:
 *   - 1 Super Admin
 *   - 7 standard teams (PRD §6.1) with one leader each
 *   - 14 interns (2 per team, with one multi-team intern for variety)
 *   - 25 leads across all statuses, several converted with deal values
 *   - 5 projects with deliverables and tasks
 *   - Last 30 days of attendance for every active user
 *   - Last 14 working days of daily reports (with realistic gaps)
 *   - 10 tickets across types and statuses
 *   - 5 leader-feedback rows
 *   - Default ScoringConfig
 *
 * Demo credentials:
 *   admin@digitalvetri.com / ChangeMe!123 (Super Admin)
 *   <first.last>@digitalvetri.com / Welcome!123 (leaders + interns)
 */
import {
  AttendanceStatus,
  LeadStatus,
  PrismaClient,
  ProjectStatus,
  Role,
  TaskPriority,
  TaskStatus,
  TicketPriority,
  TicketStatus,
  TicketType,
  type User,
  type Team,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS = {
  attendance: 0.15,
  task: 0.25,
  lead: 0.25,
  project: 0.15,
  feedback: 0.15,
  discipline: 0.05,
};

const STANDARD_TEAMS = [
  { name: 'Lead Generation Team', category: 'sales' },
  { name: 'CRM Development Team', category: 'engineering' },
  { name: 'Website Development Team', category: 'engineering' },
  { name: 'Mobile App Team', category: 'engineering' },
  { name: 'AI Development Team', category: 'engineering' },
  { name: 'Digital Marketing Team', category: 'marketing' },
  { name: 'Content Creation Team', category: 'content' },
] as const;

type TeamKey = (typeof STANDARD_TEAMS)[number]['name'];

interface PersonSpec {
  full_name: string;
  email: string;
  role: Role;
  team: TeamKey;
  /** Optional second team membership (FR-USR-3, PRD §4.4 multi-team example). */
  secondary_team?: TeamKey;
  internship_role?: string;
  college?: string;
  degree?: string;
  year_of_study?: string;
  joining_date_days_ago?: number;
}

const LEADERS: PersonSpec[] = [
  { full_name: 'Priya Iyer', email: 'priya.iyer@digitalvetri.com', role: Role.team_leader, team: 'Lead Generation Team', joining_date_days_ago: 365 },
  { full_name: 'Rohan Mehta', email: 'rohan.mehta@digitalvetri.com', role: Role.team_leader, team: 'CRM Development Team', joining_date_days_ago: 400 },
  { full_name: 'Anjali Rao', email: 'anjali.rao@digitalvetri.com', role: Role.team_leader, team: 'Website Development Team', joining_date_days_ago: 320 },
  { full_name: 'Karthik Pillai', email: 'karthik.pillai@digitalvetri.com', role: Role.team_leader, team: 'Mobile App Team', joining_date_days_ago: 280 },
  { full_name: 'Sneha Reddy', email: 'sneha.reddy@digitalvetri.com', role: Role.team_leader, team: 'AI Development Team', joining_date_days_ago: 200 },
  { full_name: 'Vikram Singh', email: 'vikram.singh@digitalvetri.com', role: Role.team_leader, team: 'Digital Marketing Team', joining_date_days_ago: 240 },
  { full_name: 'Divya Nair', email: 'divya.nair@digitalvetri.com', role: Role.team_leader, team: 'Content Creation Team', joining_date_days_ago: 180 },
];

const INTERNS: PersonSpec[] = [
  { full_name: 'Arjun Sharma', email: 'arjun.sharma@digitalvetri.com', role: Role.intern, team: 'Lead Generation Team', internship_role: 'Lead Gen Intern', college: 'IIT Bombay', degree: 'B.Tech CSE', year_of_study: '3rd', joining_date_days_ago: 75 },
  { full_name: 'Meera Krishnan', email: 'meera.krishnan@digitalvetri.com', role: Role.intern, team: 'Lead Generation Team', secondary_team: 'AI Development Team', internship_role: 'Lead Gen + AI Intern', college: 'NIT Trichy', degree: 'B.Tech IT', year_of_study: 'Final', joining_date_days_ago: 100 },
  { full_name: 'Aditya Verma', email: 'aditya.verma@digitalvetri.com', role: Role.intern, team: 'CRM Development Team', internship_role: 'CRM Intern', college: 'BITS Pilani', degree: 'B.E. CSE', year_of_study: '3rd', joining_date_days_ago: 60 },
  { full_name: 'Pooja Joshi', email: 'pooja.joshi@digitalvetri.com', role: Role.intern, team: 'CRM Development Team', internship_role: 'CRM Intern', college: 'VIT Vellore', degree: 'B.Tech CSE', year_of_study: 'Final', joining_date_days_ago: 90 },
  { full_name: 'Sakshi Singh', email: 'sakshi.singh@digitalvetri.com', role: Role.intern, team: 'Website Development Team', internship_role: 'Frontend Intern', college: 'IIIT Hyderabad', degree: 'B.Tech CSE', year_of_study: '3rd', joining_date_days_ago: 45 },
  { full_name: 'Vikrant Bhatt', email: 'vikrant.bhatt@digitalvetri.com', role: Role.intern, team: 'Website Development Team', internship_role: 'Full-stack Intern', college: 'DTU Delhi', degree: 'B.Tech IT', year_of_study: 'Final', joining_date_days_ago: 110 },
  { full_name: 'Karan Malhotra', email: 'karan.malhotra@digitalvetri.com', role: Role.intern, team: 'Mobile App Team', internship_role: 'Android Intern', college: 'PES University', degree: 'B.Tech CSE', year_of_study: '3rd', joining_date_days_ago: 50 },
  { full_name: 'Riya Chatterjee', email: 'riya.chatterjee@digitalvetri.com', role: Role.intern, team: 'Mobile App Team', internship_role: 'iOS Intern', college: 'Jadavpur University', degree: 'B.E. CSE', year_of_study: 'Final', joining_date_days_ago: 85 },
  { full_name: 'Ishita Kumar', email: 'ishita.kumar@digitalvetri.com', role: Role.intern, team: 'AI Development Team', internship_role: 'ML Intern', college: 'IIT Madras', degree: 'M.Tech AI', year_of_study: '1st', joining_date_days_ago: 65 },
  { full_name: 'Manav Kapoor', email: 'manav.kapoor@digitalvetri.com', role: Role.intern, team: 'AI Development Team', internship_role: 'Data Intern', college: 'IISc Bangalore', degree: 'M.E. CS', year_of_study: '1st', joining_date_days_ago: 30 },
  { full_name: 'Aniket Pawar', email: 'aniket.pawar@digitalvetri.com', role: Role.intern, team: 'Digital Marketing Team', internship_role: 'Performance Intern', college: 'COEP Pune', degree: 'BBA', year_of_study: '3rd', joining_date_days_ago: 55 },
  { full_name: 'Diya Saxena', email: 'diya.saxena@digitalvetri.com', role: Role.intern, team: 'Digital Marketing Team', internship_role: 'SEO Intern', college: 'Christ University', degree: 'BBA', year_of_study: 'Final', joining_date_days_ago: 95 },
  { full_name: 'Ananya Gupta', email: 'ananya.gupta@digitalvetri.com', role: Role.intern, team: 'Content Creation Team', internship_role: 'Copywriting Intern', college: 'Symbiosis Pune', degree: 'BA Mass Comm', year_of_study: 'Final', joining_date_days_ago: 70 },
  { full_name: 'Krish Bhandari', email: 'krish.bhandari@digitalvetri.com', role: Role.intern, team: 'Content Creation Team', internship_role: 'Video Editor Intern', college: 'MIT WPU', degree: 'B.Sc Media', year_of_study: '3rd', joining_date_days_ago: 40 },
];

interface LeadSpec {
  name: string;
  phone: string;
  email?: string;
  source: string;
  service_interest: string;
  location: string;
  status: LeadStatus;
  team: TeamKey;
  assignee_email: string;
  estimated_value: number;
  deal_value?: number;
  days_since_activity: number;
}

const LEADS: LeadSpec[] = [
  { name: 'Anand Solutions Pvt Ltd', phone: '+91 98765 11001', email: 'kapil@anandsol.com', source: 'LinkedIn', service_interest: 'CRM build', location: 'Bengaluru', status: LeadStatus.new, team: 'Lead Generation Team', assignee_email: 'arjun.sharma@digitalvetri.com', estimated_value: 80000, days_since_activity: 0 },
  { name: 'Skyline Realty', phone: '+91 98765 11002', email: 'leads@skylinerealty.in', source: 'Referral', service_interest: 'Lead automation', location: 'Mumbai', status: LeadStatus.contacted, team: 'Lead Generation Team', assignee_email: 'arjun.sharma@digitalvetri.com', estimated_value: 120000, days_since_activity: 1 },
  { name: 'BrewLab Coffee', phone: '+91 98765 11003', email: 'kiran@brewlab.co', source: 'Cold outreach', service_interest: 'Marketing campaign', location: 'Pune', status: LeadStatus.interested, team: 'Lead Generation Team', assignee_email: 'meera.krishnan@digitalvetri.com', estimated_value: 50000, days_since_activity: 2 },
  { name: 'NovaTech Industries', phone: '+91 98765 11004', email: 'cto@novatech.in', source: 'LinkedIn', service_interest: 'AI agent', location: 'Hyderabad', status: LeadStatus.follow_up, team: 'Lead Generation Team', assignee_email: 'meera.krishnan@digitalvetri.com', estimated_value: 250000, days_since_activity: 1 },
  { name: 'GreenLeaf Fitness', phone: '+91 98765 11005', email: 'owner@greenleaffit.in', source: 'Instagram', service_interest: 'Website', location: 'Chennai', status: LeadStatus.converted, team: 'Lead Generation Team', assignee_email: 'arjun.sharma@digitalvetri.com', estimated_value: 75000, deal_value: 82000, days_since_activity: 5 },
  { name: 'Patel Logistics', phone: '+91 98765 11006', email: 'sales@patellogistics.com', source: 'Referral', service_interest: 'Mobile app', location: 'Ahmedabad', status: LeadStatus.converted, team: 'Lead Generation Team', assignee_email: 'meera.krishnan@digitalvetri.com', estimated_value: 200000, deal_value: 215000, days_since_activity: 7 },
  { name: 'Lotus EdTech', phone: '+91 98765 11007', source: 'Website form', service_interest: 'CRM', location: 'Bengaluru', status: LeadStatus.lost, team: 'Lead Generation Team', assignee_email: 'arjun.sharma@digitalvetri.com', estimated_value: 90000, days_since_activity: 8 },
  { name: 'OceanMart Retail', phone: '+91 98765 11008', email: 'tech@oceanmart.in', source: 'Cold outreach', service_interest: 'Lead automation', location: 'Kochi', status: LeadStatus.new, team: 'Lead Generation Team', assignee_email: 'meera.krishnan@digitalvetri.com', estimated_value: 110000, days_since_activity: 0 },
  { name: 'Skyhawk Aviation', phone: '+91 98765 11009', email: 'office@skyhawkaviation.com', source: 'LinkedIn', service_interest: 'Marketing', location: 'Delhi', status: LeadStatus.contacted, team: 'Lead Generation Team', assignee_email: 'arjun.sharma@digitalvetri.com', estimated_value: 60000, days_since_activity: 4 },
  { name: 'Urja Solar', phone: '+91 98765 11010', email: 'b2b@urjasolar.in', source: 'Trade show', service_interest: 'CRM + automation', location: 'Jaipur', status: LeadStatus.interested, team: 'Lead Generation Team', assignee_email: 'meera.krishnan@digitalvetri.com', estimated_value: 180000, days_since_activity: 3 },
  { name: 'Bharat Print Studio', phone: '+91 98765 11011', source: 'Referral', service_interest: 'Website', location: 'Mumbai', status: LeadStatus.follow_up, team: 'Lead Generation Team', assignee_email: 'arjun.sharma@digitalvetri.com', estimated_value: 40000, days_since_activity: 1 },
  { name: 'PixelForge Studios', phone: '+91 98765 11012', email: 'hello@pixelforge.io', source: 'Instagram', service_interest: 'Mobile app', location: 'Bengaluru', status: LeadStatus.converted, team: 'Lead Generation Team', assignee_email: 'arjun.sharma@digitalvetri.com', estimated_value: 150000, deal_value: 165000, days_since_activity: 10 },
  { name: 'Saffron Foods', phone: '+91 98765 11013', email: 'ceo@saffronfoods.in', source: 'Cold outreach', service_interest: 'Marketing campaign', location: 'Lucknow', status: LeadStatus.new, team: 'Lead Generation Team', assignee_email: 'meera.krishnan@digitalvetri.com', estimated_value: 95000, days_since_activity: 0 },
  { name: 'Coastal Spa', phone: '+91 98765 11014', source: 'Cold outreach', service_interest: 'Website', location: 'Goa', status: LeadStatus.invalid, team: 'Lead Generation Team', assignee_email: 'arjun.sharma@digitalvetri.com', estimated_value: 0, days_since_activity: 12 },
  { name: 'Trident Engineering', phone: '+91 98765 11015', email: 'admin@tridenteng.in', source: 'LinkedIn', service_interest: 'CRM', location: 'Pune', status: LeadStatus.contacted, team: 'Lead Generation Team', assignee_email: 'meera.krishnan@digitalvetri.com', estimated_value: 140000, days_since_activity: 2 },
  { name: 'NeoBank Fintech', phone: '+91 98765 11016', email: 'partnerships@neobank.in', source: 'Referral', service_interest: 'AI agent', location: 'Bengaluru', status: LeadStatus.interested, team: 'Lead Generation Team', assignee_email: 'arjun.sharma@digitalvetri.com', estimated_value: 300000, days_since_activity: 1 },
  { name: 'Vibe Music', phone: '+91 98765 11017', source: 'Instagram', service_interest: 'Website + content', location: 'Mumbai', status: LeadStatus.follow_up, team: 'Lead Generation Team', assignee_email: 'meera.krishnan@digitalvetri.com', estimated_value: 65000, days_since_activity: 2 },
  { name: 'Arihant Hospitals', phone: '+91 98765 11018', email: 'it@arihant.org', source: 'Website form', service_interest: 'Mobile app', location: 'Indore', status: LeadStatus.converted, team: 'Lead Generation Team', assignee_email: 'meera.krishnan@digitalvetri.com', estimated_value: 220000, deal_value: 240000, days_since_activity: 14 },
  { name: 'GreenCart Organic', phone: '+91 98765 11019', email: 'team@greencart.in', source: 'LinkedIn', service_interest: 'Marketing', location: 'Bengaluru', status: LeadStatus.lost, team: 'Lead Generation Team', assignee_email: 'arjun.sharma@digitalvetri.com', estimated_value: 50000, days_since_activity: 15 },
  { name: 'BlueRock Holdings', phone: '+91 98765 11020', email: 'office@bluerock.in', source: 'Cold outreach', service_interest: 'CRM + automation', location: 'Chennai', status: LeadStatus.new, team: 'Lead Generation Team', assignee_email: 'meera.krishnan@digitalvetri.com', estimated_value: 130000, days_since_activity: 0 },
  // A few stale leads to populate the dashboard exception
  { name: 'Stale Lead — Wireframe Co', phone: '+91 98765 11021', source: 'Cold outreach', service_interest: 'Website', location: 'Surat', status: LeadStatus.contacted, team: 'Lead Generation Team', assignee_email: 'arjun.sharma@digitalvetri.com', estimated_value: 50000, days_since_activity: 6 },
  { name: 'Stale Lead — Mango Apparel', phone: '+91 98765 11022', email: 'sales@mangoapparel.in', source: 'LinkedIn', service_interest: 'Marketing campaign', location: 'Tirupur', status: LeadStatus.interested, team: 'Lead Generation Team', assignee_email: 'meera.krishnan@digitalvetri.com', estimated_value: 75000, days_since_activity: 9 },
  { name: 'Stale Lead — Kavya Boutique', phone: '+91 98765 11023', source: 'Instagram', service_interest: 'Mobile app', location: 'Jaipur', status: LeadStatus.follow_up, team: 'Lead Generation Team', assignee_email: 'arjun.sharma@digitalvetri.com', estimated_value: 30000, days_since_activity: 11 },
  { name: 'Helix Pharma', phone: '+91 98765 11024', email: 'b2b@helixpharma.in', source: 'Trade show', service_interest: 'CRM', location: 'Mumbai', status: LeadStatus.contacted, team: 'Lead Generation Team', assignee_email: 'meera.krishnan@digitalvetri.com', estimated_value: 175000, days_since_activity: 3 },
  { name: 'Voltworks Energy', phone: '+91 98765 11025', email: 'pro@voltworks.io', source: 'Referral', service_interest: 'AI agent', location: 'Bengaluru', status: LeadStatus.interested, team: 'Lead Generation Team', assignee_email: 'arjun.sharma@digitalvetri.com', estimated_value: 280000, days_since_activity: 1 },
];

interface ProjectSpec {
  name: string;
  team: TeamKey;
  category: string;
  client_name?: string;
  description: string;
  status: ProjectStatus;
  progress_pct: number;
  start_days_ago: number;
  deadline_days_from_now: number;
  deliverables: { title: string; is_done: boolean }[];
  tasks: {
    title: string;
    assignee_email: string;
    priority: TaskPriority;
    status: TaskStatus;
    progress_pct: number;
    due_days_from_now: number;
  }[];
}

const PROJECTS: ProjectSpec[] = [
  {
    name: 'CRM Development',
    team: 'CRM Development Team',
    category: 'engineering',
    client_name: 'Anand Solutions Pvt Ltd',
    description: 'Custom CRM module for sales pipeline and account management.',
    status: ProjectStatus.in_progress,
    progress_pct: 55,
    start_days_ago: 35,
    deadline_days_from_now: 21,
    deliverables: [
      { title: 'Schema design', is_done: true },
      { title: 'Auth + RBAC', is_done: true },
      { title: 'Lead pipeline UI', is_done: false },
      { title: 'Reporting dashboards', is_done: false },
      { title: 'Email integration', is_done: false },
    ],
    tasks: [
      { title: 'Wire lead pipeline drag-and-drop', assignee_email: 'aditya.verma@digitalvetri.com', priority: TaskPriority.high, status: TaskStatus.in_progress, progress_pct: 60, due_days_from_now: 4 },
      { title: 'Build reporting dashboard MVP', assignee_email: 'pooja.joshi@digitalvetri.com', priority: TaskPriority.high, status: TaskStatus.todo, progress_pct: 0, due_days_from_now: 10 },
      { title: 'Set up email webhooks', assignee_email: 'aditya.verma@digitalvetri.com', priority: TaskPriority.medium, status: TaskStatus.in_review, progress_pct: 90, due_days_from_now: 2 },
      { title: 'Review schema with client', assignee_email: 'pooja.joshi@digitalvetri.com', priority: TaskPriority.low, status: TaskStatus.completed, progress_pct: 100, due_days_from_now: -10 },
    ],
  },
  {
    name: 'Client Website — Anand Solutions',
    team: 'Website Development Team',
    category: 'client-build',
    client_name: 'Anand Solutions Pvt Ltd',
    description: 'Marketing site refresh, ~10 pages, CMS-driven.',
    status: ProjectStatus.in_progress,
    progress_pct: 70,
    start_days_ago: 28,
    deadline_days_from_now: 7,
    deliverables: [
      { title: 'Design system', is_done: true },
      { title: 'Home + about', is_done: true },
      { title: 'Services pages', is_done: true },
      { title: 'Case studies', is_done: false },
      { title: 'Blog + CMS wiring', is_done: false },
    ],
    tasks: [
      { title: 'Ship case studies template', assignee_email: 'sakshi.singh@digitalvetri.com', priority: TaskPriority.urgent, status: TaskStatus.in_progress, progress_pct: 70, due_days_from_now: 2 },
      { title: 'CMS schema for blog', assignee_email: 'vikrant.bhatt@digitalvetri.com', priority: TaskPriority.high, status: TaskStatus.todo, progress_pct: 0, due_days_from_now: 5 },
      { title: 'Hero animation polish', assignee_email: 'sakshi.singh@digitalvetri.com', priority: TaskPriority.low, status: TaskStatus.blocked, progress_pct: 30, due_days_from_now: -1 },
    ],
  },
  {
    name: 'AI Agent Development',
    team: 'AI Development Team',
    category: 'internal',
    description: 'Internal lead-scoring agent that ranks the daily new-lead queue.',
    status: ProjectStatus.in_progress,
    progress_pct: 30,
    start_days_ago: 21,
    deadline_days_from_now: 45,
    deliverables: [
      { title: 'Data pipeline', is_done: true },
      { title: 'Feature engineering', is_done: false },
      { title: 'Baseline model', is_done: false },
      { title: 'Inference API', is_done: false },
    ],
    tasks: [
      { title: 'Feature engineering pass', assignee_email: 'ishita.kumar@digitalvetri.com', priority: TaskPriority.high, status: TaskStatus.in_progress, progress_pct: 45, due_days_from_now: 8 },
      { title: 'Set up training notebooks', assignee_email: 'manav.kapoor@digitalvetri.com', priority: TaskPriority.medium, status: TaskStatus.completed, progress_pct: 100, due_days_from_now: -7 },
      { title: 'Evaluate baseline model', assignee_email: 'ishita.kumar@digitalvetri.com', priority: TaskPriority.high, status: TaskStatus.todo, progress_pct: 0, due_days_from_now: 14 },
    ],
  },
  {
    name: 'Mobile App — Patel Logistics',
    team: 'Mobile App Team',
    category: 'client-build',
    client_name: 'Patel Logistics',
    description: 'Driver-facing iOS + Android app for delivery routing.',
    status: ProjectStatus.in_progress,
    progress_pct: 40,
    start_days_ago: 18,
    deadline_days_from_now: 35,
    deliverables: [
      { title: 'Wireframes', is_done: true },
      { title: 'Auth + onboarding', is_done: true },
      { title: 'Route map', is_done: false },
      { title: 'Driver actions', is_done: false },
      { title: 'Backend sync', is_done: false },
    ],
    tasks: [
      { title: 'Build route map screen', assignee_email: 'karan.malhotra@digitalvetri.com', priority: TaskPriority.high, status: TaskStatus.in_progress, progress_pct: 50, due_days_from_now: 6 },
      { title: 'iOS auth flow', assignee_email: 'riya.chatterjee@digitalvetri.com', priority: TaskPriority.medium, status: TaskStatus.in_review, progress_pct: 85, due_days_from_now: 1 },
      { title: 'Define API contracts', assignee_email: 'karan.malhotra@digitalvetri.com', priority: TaskPriority.medium, status: TaskStatus.completed, progress_pct: 100, due_days_from_now: -5 },
    ],
  },
  {
    name: 'Marketing Campaign — Q3 Launch',
    team: 'Digital Marketing Team',
    category: 'campaign',
    description: 'Multi-channel campaign for the Q3 product line refresh.',
    status: ProjectStatus.planning,
    progress_pct: 15,
    start_days_ago: 10,
    deadline_days_from_now: 60,
    deliverables: [
      { title: 'Channel mix proposal', is_done: true },
      { title: 'Creative brief', is_done: false },
      { title: 'Performance tracking setup', is_done: false },
      { title: 'Launch playbook', is_done: false },
    ],
    tasks: [
      { title: 'Draft creative brief', assignee_email: 'aniket.pawar@digitalvetri.com', priority: TaskPriority.medium, status: TaskStatus.in_progress, progress_pct: 35, due_days_from_now: 7 },
      { title: 'SEO keyword research', assignee_email: 'diya.saxena@digitalvetri.com', priority: TaskPriority.medium, status: TaskStatus.todo, progress_pct: 0, due_days_from_now: 12 },
    ],
  },
];

interface TicketSpec {
  raiser_email: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  team?: TeamKey;
  title: string;
  description: string;
  created_days_ago: number;
  assignee_email?: string;
  replies?: { sender_email: string; message: string; days_ago: number }[];
}

const TICKETS: TicketSpec[] = [
  { raiser_email: 'arjun.sharma@digitalvetri.com', type: TicketType.technical, priority: TicketPriority.high, status: TicketStatus.in_progress, team: 'Lead Generation Team', title: 'CRM export to CSV is timing out', description: 'When exporting more than 500 leads the request 504s. Tried both filtered and unfiltered.', created_days_ago: 2, assignee_email: 'priya.iyer@digitalvetri.com', replies: [{ sender_email: 'priya.iyer@digitalvetri.com', message: 'Looking into the export pipeline — backend will need to stream the response.', days_ago: 1 }] },
  { raiser_email: 'meera.krishnan@digitalvetri.com', type: TicketType.leave_request, priority: TicketPriority.medium, status: TicketStatus.open, title: 'Leave for college viva (next Friday)', description: 'Need a full-day leave next Friday for my college viva. Will sync with team in advance.', created_days_ago: 0 },
  { raiser_email: 'pooja.joshi@digitalvetri.com', type: TicketType.project_support, priority: TicketPriority.high, status: TicketStatus.resolved, team: 'CRM Development Team', title: 'Stuck on RBAC guard for multi-team users', description: 'JWT strategy is returning the right roles but the scope guard misses one team membership.', created_days_ago: 5, assignee_email: 'rohan.mehta@digitalvetri.com', replies: [{ sender_email: 'rohan.mehta@digitalvetri.com', message: 'You need to flatten the memberships through the user join — push your branch.', days_ago: 4 }, { sender_email: 'pooja.joshi@digitalvetri.com', message: 'Pushed — works locally now.', days_ago: 3 }] },
  { raiser_email: 'vikrant.bhatt@digitalvetri.com', type: TicketType.access_request, priority: TicketPriority.low, status: TicketStatus.closed, title: 'Need access to staging Vercel project', description: 'Staging deploys are blocked because my GitHub email isn’t on the Vercel team.', created_days_ago: 8, replies: [{ sender_email: 'priya.iyer@digitalvetri.com', message: 'Added you with deployer role.', days_ago: 7 }] },
  { raiser_email: 'ishita.kumar@digitalvetri.com', type: TicketType.technical, priority: TicketPriority.urgent, status: TicketStatus.open, team: 'AI Development Team', title: 'GPU runtime crashes after 4hr', description: 'The training job keeps OOMing around batch 1200. Tried smaller batch — same result.', created_days_ago: 0 },
  { raiser_email: 'karan.malhotra@digitalvetri.com', type: TicketType.general, priority: TicketPriority.medium, status: TicketStatus.in_progress, title: 'Process for shipping a build to TestFlight', description: 'What’s the canonical process for getting a new TestFlight build out to the client?', created_days_ago: 3 },
  { raiser_email: 'sakshi.singh@digitalvetri.com', type: TicketType.project_support, priority: TicketPriority.medium, status: TicketStatus.open, team: 'Website Development Team', title: 'Blocked on case studies template', description: 'Design needs sign-off before I can finalize CMS schema.', created_days_ago: 1, assignee_email: 'anjali.rao@digitalvetri.com' },
  { raiser_email: 'aniket.pawar@digitalvetri.com', type: TicketType.access_request, priority: TicketPriority.low, status: TicketStatus.resolved, title: 'Access to GA4 property', description: 'Need read access to the GA4 property for the Q3 campaign tracking.', created_days_ago: 4, replies: [{ sender_email: 'vikram.singh@digitalvetri.com', message: 'Added — refresh and you should see it.', days_ago: 3 }] },
  { raiser_email: 'diya.saxena@digitalvetri.com', type: TicketType.leave_request, priority: TicketPriority.low, status: TicketStatus.closed, title: 'Half-day this Thursday', description: 'Need half-day Thursday afternoon for a family event.', created_days_ago: 7 },
  { raiser_email: 'krish.bhandari@digitalvetri.com', type: TicketType.technical, priority: TicketPriority.high, status: TicketStatus.open, team: 'Content Creation Team', title: 'Premiere keeps freezing on 4K timeline', description: 'Adobe Premiere freezes for 30s+ when scrubbing the 4K project. Already on the latest version.', created_days_ago: 1, assignee_email: 'divya.nair@digitalvetri.com' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Seed runner
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@digitalvetri.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!123';
  const cohortPassword = process.env.SEED_COHORT_PASSWORD ?? 'Welcome!123';

  const adminHash = await argon2.hash(adminPassword);
  const cohortHash = await argon2.hash(cohortPassword);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      full_name: 'DigitalVetri Admin',
      email: adminEmail,
      password_hash: adminHash,
      role: Role.super_admin,
    },
  });

  const teams = await seedTeams(admin.id);
  const teamByName = new Map<TeamKey, Team>(
    Object.entries(teams).map(([name, team]) => [name as TeamKey, team]),
  );

  await prisma.scoringConfig.upsert({
    where: { is_active: true },
    update: {},
    create: { is_active: true, weights: DEFAULT_WEIGHTS, updated_by: admin.id },
  });

  const leaders = await seedPeople(LEADERS, cohortHash, teamByName);
  await assignLeaders(leaders);

  const interns = await seedPeople(INTERNS, cohortHash, teamByName);

  const allCohort = [...leaders, ...interns];
  const userByEmail = new Map<string, User>(allCohort.map((u) => [u.email, u]));

  await seedLeads(teamByName, userByEmail);
  await seedProjects(teamByName, userByEmail, admin.id);
  await seedAttendance(allCohort);
  await seedDailyReports(allCohort);
  await seedTickets(teamByName, userByEmail);
  await seedFeedback(leaders, interns);

  console.log('Seed complete.');
  console.log(`  Admin: ${admin.email} / ${adminPassword}`);
  console.log(`  Cohort (${allCohort.length}): <email> / ${cohortPassword}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-seeders
// ─────────────────────────────────────────────────────────────────────────────

async function seedTeams(adminId: string): Promise<Record<string, Team>> {
  const out: Record<string, Team> = {};
  for (const t of STANDARD_TEAMS) {
    out[t.name] = await prisma.team.upsert({
      where: { name: t.name },
      update: {},
      create: { name: t.name, category: t.category, description: `${t.name}` },
    });
  }
  void adminId;
  return out;
}

async function seedPeople(
  specs: PersonSpec[],
  passwordHash: string,
  teamByName: Map<TeamKey, Team>,
): Promise<User[]> {
  const out: User[] = [];
  for (const p of specs) {
    const joining = p.joining_date_days_ago
      ? new Date(Date.now() - p.joining_date_days_ago * 24 * 60 * 60 * 1000)
      : null;
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        full_name: p.full_name,
        email: p.email,
        password_hash: passwordHash,
        role: p.role,
        college: p.college ?? null,
        degree: p.degree ?? null,
        year_of_study: p.year_of_study ?? null,
        internship_role: p.internship_role ?? null,
        joining_date: joining,
        department: teamByName.get(p.team)?.category ?? null,
      },
    });
    out.push(user);

    const primaryTeam = teamByName.get(p.team);
    if (primaryTeam) {
      await prisma.teamMember.upsert({
        where: { team_id_user_id: { team_id: primaryTeam.id, user_id: user.id } },
        update: {},
        create: { team_id: primaryTeam.id, user_id: user.id, is_primary: true },
      });
    }
    if (p.secondary_team) {
      const sec = teamByName.get(p.secondary_team);
      if (sec) {
        await prisma.teamMember.upsert({
          where: { team_id_user_id: { team_id: sec.id, user_id: user.id } },
          update: {},
          create: { team_id: sec.id, user_id: user.id, is_primary: false },
        });
      }
    }
  }
  return out;
}

async function assignLeaders(leaders: User[]) {
  const leaderByEmail = new Map(leaders.map((l) => [l.email, l]));
  for (const spec of LEADERS) {
    const leader = leaderByEmail.get(spec.email);
    if (!leader) continue;
    const team = await prisma.team.findUnique({ where: { name: spec.team } });
    if (!team) continue;
    if (team.leader_id === leader.id) continue;
    await prisma.team.update({ where: { id: team.id }, data: { leader_id: leader.id } });
  }
}

async function seedLeads(
  teamByName: Map<TeamKey, Team>,
  userByEmail: Map<string, User>,
) {
  for (const spec of LEADS) {
    const team = teamByName.get(spec.team);
    const assignee = userByEmail.get(spec.assignee_email);
    if (!team || !assignee) continue;

    const existing = await prisma.lead.findFirst({
      where: { name: spec.name, phone: spec.phone },
      select: { id: true },
    });
    if (existing) continue;

    const lastActivityAt = new Date(
      Date.now() - spec.days_since_activity * 24 * 60 * 60 * 1000,
    );
    const convertedAt =
      spec.status === LeadStatus.converted ? lastActivityAt : null;

    await prisma.lead.create({
      data: {
        name: spec.name,
        phone: spec.phone,
        email: spec.email ?? null,
        source: spec.source,
        service_interest: spec.service_interest,
        location: spec.location,
        estimated_value: spec.estimated_value,
        status: spec.status,
        team_id: team.id,
        assigned_to: assignee.id,
        next_follow_up:
          spec.status === LeadStatus.follow_up
            ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
            : null,
        deal_value: spec.deal_value ?? null,
        converted_at: convertedAt,
        last_activity_at: lastActivityAt,
        activities: {
          create: [
            {
              actor_id: assignee.id,
              to_status: LeadStatus.new,
              note: 'Created during seed',
            },
            ...(spec.status !== LeadStatus.new
              ? [{ actor_id: assignee.id, from_status: LeadStatus.new, to_status: spec.status, note: 'Status set during seed' }]
              : []),
          ],
        },
      },
    });
  }
}

async function seedProjects(
  teamByName: Map<TeamKey, Team>,
  userByEmail: Map<string, User>,
  adminId: string,
) {
  for (const spec of PROJECTS) {
    const team = teamByName.get(spec.team);
    if (!team) continue;

    const existing = await prisma.project.findFirst({
      where: { name: spec.name, team_id: team.id },
      select: { id: true },
    });
    if (existing) continue;

    const project = await prisma.project.create({
      data: {
        name: spec.name,
        description: spec.description,
        client_name: spec.client_name ?? null,
        category: spec.category,
        team_id: team.id,
        status: spec.status,
        progress_pct: spec.progress_pct,
        start_date: new Date(Date.now() - spec.start_days_ago * 24 * 60 * 60 * 1000),
        deadline: new Date(Date.now() + spec.deadline_days_from_now * 24 * 60 * 60 * 1000),
        deliverables: {
          create: spec.deliverables.map((d) => ({ title: d.title, is_done: d.is_done })),
        },
      },
    });

    for (const t of spec.tasks) {
      const assignee = userByEmail.get(t.assignee_email);
      if (!assignee) continue;
      const dueDate = new Date(
        Date.now() + t.due_days_from_now * 24 * 60 * 60 * 1000,
      );
      const isCompleted = t.status === TaskStatus.completed;
      await prisma.task.create({
        data: {
          title: t.title,
          assignee_id: assignee.id,
          project_id: project.id,
          created_by: adminId,
          priority: t.priority,
          status: t.status,
          progress_pct: t.progress_pct,
          due_date: dueDate,
          completed_at: isCompleted ? new Date(dueDate.getTime() - 24 * 60 * 60 * 1000) : null,
          activities: {
            create: [
              { actor_id: adminId, action: 'created', note: 'Seed' },
            ],
          },
        },
      });
    }
  }
}

async function seedAttendance(users: User[]) {
  const today = startOfDay(new Date());
  const days: Date[] = [];
  for (let i = 0; i < 30; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (isWorkingDay(d)) days.push(d);
  }

  // RNG seeded per user so attendance is stable across re-runs and not all identical.
  for (const user of users) {
    const rng = seedRandom(user.id);
    for (const d of days) {
      if (user.joining_date && d.getTime() < startOfDay(user.joining_date).getTime()) continue;
      const exists = await prisma.attendance.findUnique({
        where: { user_id_date: { user_id: user.id, date: d } },
        select: { id: true },
      });
      if (exists) continue;

      const r = rng();
      let status: AttendanceStatus;
      if (r < 0.82) status = AttendanceStatus.present;
      else if (r < 0.92) status = AttendanceStatus.late;
      else if (r < 0.95) status = AttendanceStatus.half_day;
      else if (r < 0.98) status = AttendanceStatus.leave;
      else status = AttendanceStatus.absent;

      const checkIn =
        status === AttendanceStatus.present || status === AttendanceStatus.late
          ? new Date(
              new Date(d).setHours(status === AttendanceStatus.late ? 10 + Math.floor(rng() * 2) : 9 + Math.floor(rng() * 1), Math.floor(rng() * 60), 0, 0),
            )
          : null;
      const checkOut = checkIn
        ? new Date(new Date(d).setHours(18 + Math.floor(rng() * 2), Math.floor(rng() * 60), 0, 0))
        : null;

      await prisma.attendance.create({
        data: {
          user_id: user.id,
          date: d,
          status,
          check_in: checkIn,
          check_out: checkOut,
        },
      });
    }
  }
}

async function seedDailyReports(users: User[]) {
  const today = startOfDay(new Date());
  const days: Date[] = [];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (isWorkingDay(d)) days.push(d);
  }

  for (const user of users) {
    if (user.role === Role.super_admin) continue;
    const rng = seedRandom(user.id + ':report');
    for (const d of days) {
      if (user.joining_date && d.getTime() < startOfDay(user.joining_date).getTime()) continue;
      // 15% of working days are intentionally skipped to populate missing-report exception.
      if (rng() < 0.15) continue;
      const exists = await prisma.dailyReport.findUnique({
        where: { user_id_report_date: { user_id: user.id, report_date: d } },
        select: { id: true },
      });
      if (exists) continue;

      const isToday = d.getTime() === today.getTime();
      const submittedLate = !isToday && rng() < 0.2;
      await prisma.dailyReport.create({
        data: {
          user_id: user.id,
          report_date: d,
          todays_work: pickReportLine(rng, [
            'Pushed two PRs in the project, both passing CI.',
            'Worked on the analytics dashboard layout, ironing out the spacing issues.',
            'Connected with two prospects and updated the pipeline statuses.',
            'Wrote the documentation for the new module + added screenshots.',
            'Pair-programmed with a teammate on the tricky bit of the auth flow.',
            'Cleaned up the lead import — added phone validation and source dedupe.',
            'Sketched the v2 of the marketing landing page in Figma.',
            'Made progress on the training pipeline + initial loss numbers look reasonable.',
          ]),
          challenges: pickReportLine(rng, [
            'Hit a CORS issue with the staging API; resolved by allowlisting the right origin.',
            'Spent ~1.5h chasing a flaky test before realizing it was a stale DB fixture.',
            'None today.',
            'CSS specificity battle on the navbar took longer than expected.',
            'Two prospects went cold — will follow up next week.',
          ]),
          learnings: pickReportLine(rng, [
            'Learned the difference between `useEffect` vs `useLayoutEffect` for measurement.',
            'Found a clean way to memoize the prisma queries we run on the dashboard.',
            'Skim-read the Prisma docs on `groupBy` — useful for the reports module.',
            'How to set up a debug session with conditional breakpoints in VS Code.',
            'How to use a soft-throttle in the API to avoid hammering the third-party endpoint.',
          ]),
          tomorrows_plan: pickReportLine(rng, [
            'Review yesterday\'s PR, then start on the next sprint card.',
            'Pair with the leader on the upcoming feature sketch.',
            'Knock out the two follow-up calls scheduled for the morning.',
            'Write tests for the work I shipped today.',
            'Ship the case-studies template + ask design for review.',
          ]),
          is_locked: !isToday,
          submitted_late: submittedLate,
        },
      });
    }
  }
}

async function seedTickets(
  teamByName: Map<TeamKey, Team>,
  userByEmail: Map<string, User>,
) {
  for (const spec of TICKETS) {
    const raiser = userByEmail.get(spec.raiser_email);
    if (!raiser) continue;
    const assignee = spec.assignee_email
      ? userByEmail.get(spec.assignee_email) ?? null
      : null;
    const team = spec.team ? teamByName.get(spec.team) : null;

    const existing = await prisma.ticket.findFirst({
      where: { title: spec.title, raised_by: raiser.id },
      select: { id: true },
    });
    if (existing) continue;

    const createdAt = new Date(
      Date.now() - spec.created_days_ago * 24 * 60 * 60 * 1000,
    );
    const ticket = await prisma.ticket.create({
      data: {
        raised_by: raiser.id,
        type: spec.type,
        priority: spec.priority,
        status: spec.status,
        title: spec.title,
        description: spec.description,
        assigned_to: assignee?.id ?? null,
        team_id: team?.id ?? null,
        created_at: createdAt,
        closed_at:
          spec.status === TicketStatus.closed
            ? new Date(createdAt.getTime() + 24 * 60 * 60 * 1000)
            : null,
      },
    });

    if (spec.replies?.length) {
      for (const reply of spec.replies) {
        const sender = userByEmail.get(reply.sender_email);
        if (!sender) continue;
        await prisma.ticketMessage.create({
          data: {
            ticket_id: ticket.id,
            sender_id: sender.id,
            message: reply.message,
            created_at: new Date(Date.now() - reply.days_ago * 24 * 60 * 60 * 1000),
          },
        });
      }
    }
  }
}

async function seedFeedback(leaders: User[], interns: User[]) {
  const periodEnd = startOfDay(new Date());
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodEnd.getDate() - 29);

  // 1 feedback per leader for the first intern on their team (if any).
  const fixtures: { leader: string; subject: string; quality: number; ownership: number; collaboration: number; note: string }[] = [
    { leader: 'priya.iyer@digitalvetri.com', subject: 'arjun.sharma@digitalvetri.com', quality: 4, ownership: 5, collaboration: 4, note: 'Great pickup on the new pipeline — keep pushing on conversion quality.' },
    { leader: 'priya.iyer@digitalvetri.com', subject: 'meera.krishnan@digitalvetri.com', quality: 5, ownership: 4, collaboration: 5, note: 'Multi-team load is a lot; very thoughtful work on the AI side.' },
    { leader: 'rohan.mehta@digitalvetri.com', subject: 'aditya.verma@digitalvetri.com', quality: 4, ownership: 4, collaboration: 3, note: 'Solid PRs — could communicate progress more frequently in standup.' },
    { leader: 'anjali.rao@digitalvetri.com', subject: 'sakshi.singh@digitalvetri.com', quality: 5, ownership: 5, collaboration: 4, note: 'Pixel-perfect work on the case-study template. Outstanding.' },
    { leader: 'karthik.pillai@digitalvetri.com', subject: 'karan.malhotra@digitalvetri.com', quality: 4, ownership: 4, collaboration: 4, note: 'Reliable; just be careful with edge cases on the route screen.' },
  ];

  const leaderByEmail = new Map(leaders.map((l) => [l.email, l]));
  const internByEmail = new Map(interns.map((i) => [i.email, i]));

  for (const f of fixtures) {
    const leader = leaderByEmail.get(f.leader);
    const subject = internByEmail.get(f.subject);
    if (!leader || !subject) continue;
    await prisma.performanceFeedback.upsert({
      where: {
        user_id_leader_id_period_start_period_end: {
          user_id: subject.id,
          leader_id: leader.id,
          period_start: periodStart,
          period_end: periodEnd,
        },
      },
      update: {},
      create: {
        user_id: subject.id,
        leader_id: leader.id,
        period_start: periodStart,
        period_end: periodEnd,
        quality: f.quality,
        ownership: f.ownership,
        collaboration: f.collaboration,
        note: f.note,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const WORKING_DAYS = new Set([1, 2, 3, 4, 5, 6]); // Mon-Sat
function isWorkingDay(date: Date): boolean {
  return WORKING_DAYS.has(date.getDay());
}

/** Deterministic seeded PRNG (mulberry32) so seed runs are reproducible. */
function seedRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickReportLine(rng: () => number, lines: string[]): string {
  const idx = Math.floor(rng() * lines.length);
  return lines[Math.min(lines.length - 1, idx)]!;
}

// ─────────────────────────────────────────────────────────────────────────────

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
