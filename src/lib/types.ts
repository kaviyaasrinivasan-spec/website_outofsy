/** Shared API types -- mirror the Pydantic schemas in backend/app. */

export interface CompanyBrief {
  id: number;
  name: string;
  logo_url: string | null;
  industry: string | null;
  location: string | null;
}

export interface InternshipCard {
  id: number;
  title: string;
  company: CompanyBrief | null;
  duration: string | null;
  work_mode: string | null;
  location: string | null;
  stipend: string | null;
  required_skills: string[];
  last_date_to_apply: string | null;
  is_featured: boolean;
  created_at: string | null;
  has_applied: boolean;
  /** The student already has an application in play elsewhere, so they cannot
   *  start another until it finishes. One internship at a time. */
  has_active_application?: boolean;
  is_saved: boolean;
}

export interface InternshipDetail extends InternshipCard {
  description: string | null;
  responsibilities: string | null;
  openings: number | null;
}

export interface InternshipListResponse {
  items: InternshipCard[];
  total: number;
  page: number;
  page_size: number;
}

/** The 9 pipeline stages, the two holds and the two exits. Mirrors
 *  APPLICATION_STATUSES on the server. 'interview_completed' is a retired
 *  stage, kept so an older record still has a label. */
export type ApplicationStatus =
  | "applied"
  | "shortlisted"
  | "interview_scheduled"
  | "selected"
  | "awaiting_registration_fee"
  | "registration_fee_paid"
  | "internship_started"
  | "completed"
  | "certificate_issued"
  | "on_hold"
  | "not_responded"
  | "rejected"
  | "withdrawn"
  | "interview_completed";

export interface Application {
  id: number;
  status: ApplicationStatus;
  cover_note: string | null;
  applied_at: string;
  updated_at: string | null;
  internship: InternshipCard | null;
}

export interface StudentProfile {
  full_name: string;
  phone: string | null;
  whatsapp_number: string | null;
  college_name: string | null;
  course: string | null;
  current_year: string | null;
  skills: string | null;
  resume_url: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  city: string | null;
  bio: string | null;
  completion_percent: number;
}

export interface DashboardOverview {
  active_applications: number;
  total_applications: number;
  saved_internships: number;
  unread_notifications: number;
  profile_completion: number;
  member_id: string | null;
}

export interface Membership {
  member_id: string;
  tier: string;
  started_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export interface Notification {
  id: number;
  title: string;
  body: string | null;
  kind: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface SuccessStory {
  id: number;
  student_name: string;
  college_name: string | null;
  company_name: string | null;
  role: string | null;
  quote: string;
  photo_url: string | null;
}

export interface PlatformStats {
  active_internships: number;
  companies: number;
  students: number;
}

export interface MetaOptions {
  current_years: string[];
  courses: string[];
  work_modes: string[];
}

/** Human labels and badge colours for application statuses. */
export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  interview_scheduled: "Interview Scheduled",
  selected: "Selected",
  awaiting_registration_fee: "Registration Fee Pending",
  registration_fee_paid: "Registration Fee Paid",
  internship_started: "Internship Started",
  completed: "Completed",
  certificate_issued: "Certificate Issued",
  // Softer wording than the portal's: this is what the student reads.
  on_hold: "On Hold",
  not_responded: "Awaiting Your Reply",
  rejected: "Not Selected",
  withdrawn: "Withdrawn",
  interview_completed: "Interview Completed",
};

export const STATUS_CLASS: Record<ApplicationStatus, string> = {
  applied: "bg-blue-100 text-blue-700",
  shortlisted: "bg-violet-100 text-violet-700",
  interview_scheduled: "bg-indigo-100 text-indigo-700",
  selected: "bg-emerald-100 text-emerald-700",
  awaiting_registration_fee: "bg-amber-100 text-amber-700",
  registration_fee_paid: "bg-cyan-100 text-cyan-700",
  internship_started: "bg-teal-100 text-teal-700",
  completed: "bg-green-100 text-green-700",
  certificate_issued: "bg-lime-100 text-lime-700",
  on_hold: "bg-orange-100 text-orange-700",
  not_responded: "bg-stone-200 text-stone-700",
  rejected: "bg-rose-100 text-rose-700",
  withdrawn: "bg-slate-100 text-slate-600",
  interview_completed: "bg-purple-100 text-purple-700",
};

/** Formats an ISO date as e.g. "12 Aug 2026". Returns "" for null. */
export const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

/** True when a deadline has passed. */
export const isExpired = (iso: string | null | undefined): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
};
