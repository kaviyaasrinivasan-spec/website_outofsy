import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Loader2 } from "lucide-react";

const CURRENT_YEARS = ["1st Year", "2nd Year", "3rd Year", "Final Year", "Passed Out"];

const COURSES = [
  "B.E / B.Tech",
  "BCA",
  "MCA",
  "B.Sc Computer Science",
  "B.Sc Information Technology",
  "B.Sc AI & Data Science",
  "B.Sc Data Science",
  "B.Com",
  "B.Com (Computer Applications)",
  "BBA",
  "BBA (Computer Applications)",
  "M.Sc",
  "MBA",
  "Diploma",
  "Other",
];

const EMPTY = {
  full_name: "",
  whatsapp_number: "",
  email: "",
  college_name: "",
  current_year: "",
  course: "",
};

type FormValues = typeof EMPTY;
type FormErrors = Partial<Record<keyof FormValues, string>>;

const InternshipApplicationDialog = () => {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");

  const apiBase = import.meta.env.VITE_API_URL || "";

  const setField = (field: keyof FormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // Every field is mandatory.
  const validate = (): boolean => {
    const next: FormErrors = {};

    if (!values.full_name.trim()) next.full_name = "Full name is required";

    const digits = values.whatsapp_number.replace(/\D/g, "");
    if (!values.whatsapp_number.trim()) next.whatsapp_number = "WhatsApp number is required";
    else if (digits.length < 10) next.whatsapp_number = "Enter a valid mobile number";

    if (!values.email.trim()) next.email = "Email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
      next.email = "Enter a valid email address";

    if (!values.college_name.trim()) next.college_name = "College name is required";
    if (!values.current_year) next.current_year = "Please select your current year";
    if (!values.course) next.course = "Please select your course";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/applications/internship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: values.full_name.trim(),
          whatsapp_number: values.whatsapp_number.trim(),
          email: values.email.trim(),
          college_name: values.college_name.trim(),
          current_year: values.current_year,
          course: values.course,
        }),
      });

      if (!res.ok) {
        if (res.status === 422) {
          setServerError("Please check your details and try again.");
        } else if (res.status === 503) {
          setServerError(
            "Our servers are busy right now. Please try again in a few moments.",
          );
        } else {
          setServerError("Something went wrong on our side. Please try again in a moment.");
        }
        return;
      }

      await res.json();
      setSubmitted(true);
    } catch {
      setServerError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Reset back to a blank form once the dialog has closed.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setValues(EMPTY);
      setErrors({});
      setServerError("");
      setSubmitted(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="gradient" size="lg">
          Apply for 1-Month Internship
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {submitted ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
              <CheckCircle2 className="h-9 w-9 text-accent" />
            </div>
            <DialogHeader>
              <DialogTitle className="mb-3 text-center text-2xl">
                Thank You for Your Application!
              </DialogTitle>
              <DialogDescription className="text-center text-base leading-relaxed">
                Your application has been successfully submitted. Our team will review your
                details and contact you shortly. Please keep an eye on your email and WhatsApp
                for further updates.
              </DialogDescription>
            </DialogHeader>
            <Button
              variant="gradient"
              size="lg"
              className="mt-7 w-full"
              onClick={() => handleOpenChange(false)}
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">Apply for 1-Month Internship</DialogTitle>
              <DialogDescription>
                Fill in your details below. All fields are required.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={values.full_name}
                  onChange={(e) => setField("full_name", e.target.value)}
                  placeholder="Your full name"
                  aria-invalid={!!errors.full_name}
                />
                {errors.full_name && (
                  <p className="mt-1 text-sm text-destructive">{errors.full_name}</p>
                )}
              </div>

              <div>
                <Label htmlFor="whatsapp_number">WhatsApp Number *</Label>
                <Input
                  id="whatsapp_number"
                  type="tel"
                  inputMode="tel"
                  value={values.whatsapp_number}
                  onChange={(e) => setField("whatsapp_number", e.target.value)}
                  placeholder="+91 98765 43210"
                  aria-invalid={!!errors.whatsapp_number}
                />
                {errors.whatsapp_number && (
                  <p className="mt-1 text-sm text-destructive">{errors.whatsapp_number}</p>
                )}
              </div>

              <div>
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={values.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="your.email@example.com"
                  aria-invalid={!!errors.email}
                />
                {errors.email && <p className="mt-1 text-sm text-destructive">{errors.email}</p>}
              </div>

              <div>
                <Label htmlFor="college_name">College Name *</Label>
                <Input
                  id="college_name"
                  value={values.college_name}
                  onChange={(e) => setField("college_name", e.target.value)}
                  placeholder="Your college or university"
                  aria-invalid={!!errors.college_name}
                />
                {errors.college_name && (
                  <p className="mt-1 text-sm text-destructive">{errors.college_name}</p>
                )}
              </div>

              <div>
                <Label htmlFor="current_year">Current Year *</Label>
                <Select
                  value={values.current_year}
                  onValueChange={(v) => setField("current_year", v)}
                >
                  <SelectTrigger id="current_year" aria-invalid={!!errors.current_year}>
                    <SelectValue placeholder="Select your current year" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENT_YEARS.map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.current_year && (
                  <p className="mt-1 text-sm text-destructive">{errors.current_year}</p>
                )}
              </div>

              <div>
                <Label htmlFor="course">Course *</Label>
                <Select value={values.course} onValueChange={(v) => setField("course", v)}>
                  <SelectTrigger id="course" aria-invalid={!!errors.course}>
                    <SelectValue placeholder="Select your course" />
                  </SelectTrigger>
                  <SelectContent>
                    {COURSES.map((course) => (
                      <SelectItem key={course} value={course}>
                        {course}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.course && <p className="mt-1 text-sm text-destructive">{errors.course}</p>}
              </div>

              {serverError && (
                <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {serverError}
                </p>
              )}

              <Button
                type="submit"
                variant="gradient"
                size="lg"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit"
                )}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default InternshipApplicationDialog;
