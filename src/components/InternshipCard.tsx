import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkCheck, Building2, CalendarClock, Clock, MapPin, Wallet } from "lucide-react";
import { formatDate, isExpired, type InternshipCard as Internship } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  internship: Internship;
  /** Provided only when a student is signed in. */
  onToggleSave?: (id: number) => void;
  saving?: boolean;
}

const MODE_CLASS: Record<string, string> = {
  Remote: "bg-emerald-100 text-emerald-700",
  Hybrid: "bg-amber-100 text-amber-700",
  "On-site": "bg-blue-100 text-blue-700",
};

const InternshipCardItem = ({ internship, onToggleSave, saving }: Props) => {
  const expired = isExpired(internship.last_date_to_apply);

  return (
    <Card className="hover-lift flex h-full flex-col overflow-hidden">
      <CardContent className="flex flex-1 flex-col p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {internship.company?.logo_url ? (
              <img
                src={internship.company.logo_url}
                alt={internship.company.name}
                className="h-11 w-11 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                <Building2 className="h-5 w-5 text-accent" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="truncate font-bold leading-tight">{internship.title}</h3>
              <p className="truncate text-sm text-muted-foreground">
                {internship.company?.name ?? "Company"}
              </p>
            </div>
          </div>

          {onToggleSave && (
            <button
              type="button"
              onClick={() => onToggleSave(internship.id)}
              disabled={saving}
              aria-label={internship.is_saved ? "Remove from saved" : "Save internship"}
              className="shrink-0 text-muted-foreground transition-colors hover:text-accent disabled:opacity-50"
            >
              {internship.is_saved ? (
                <BookmarkCheck className="h-5 w-5 text-accent" />
              ) : (
                <Bookmark className="h-5 w-5" />
              )}
            </button>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {internship.work_mode && (
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                MODE_CLASS[internship.work_mode] ?? "bg-secondary text-secondary-foreground",
              )}
            >
              {internship.work_mode}
            </span>
          )}
          {internship.is_featured && (
            <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
              Featured
            </span>
          )}
          {expired && (
            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700">
              Closed
            </span>
          )}
        </div>

        <div className="mb-4 space-y-1.5 text-sm text-muted-foreground">
          {internship.duration && (
            <p className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" />
              {internship.duration}
            </p>
          )}
          {internship.location && (
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" />
              {internship.location}
            </p>
          )}
          {internship.stipend && (
            <p className="flex items-center gap-2">
              <Wallet className="h-4 w-4 shrink-0" />
              {internship.stipend}
            </p>
          )}
          {internship.last_date_to_apply && (
            <p className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 shrink-0" />
              Apply by {formatDate(internship.last_date_to_apply)}
            </p>
          )}
        </div>

        {internship.required_skills.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-1.5">
            {internship.required_skills.slice(0, 4).map((skill) => (
              <span
                key={skill}
                className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
              >
                {skill}
              </span>
            ))}
            {internship.required_skills.length > 4 && (
              <span className="px-1 py-0.5 text-xs text-muted-foreground">
                +{internship.required_skills.length - 4}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto">
          {/* A student already running an internship can still read the listing
              -- they just cannot apply yet, so the button stops promising it
              rather than blocking the page. */}
          <Link to={`/internships/${internship.id}`}>
            <Button
              variant={
                internship.has_applied || internship.has_active_application
                  ? "outline"
                  : "gradient"
              }
              className="w-full"
              disabled={internship.has_applied}
            >
              {internship.has_applied
                ? "Already Applied"
                : internship.has_active_application
                  ? "View Details"
                  : "View & Apply"}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

export default InternshipCardItem;
