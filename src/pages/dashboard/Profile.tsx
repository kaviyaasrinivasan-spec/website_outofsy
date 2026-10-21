import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Loader2 } from "lucide-react";
import ResumeUploadField from "@/components/ResumeUploadField";
import { api, ApiError } from "@/lib/api";
import type { MetaOptions, StudentProfile } from "@/lib/types";

const Profile = () => {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [options, setOptions] = useState<MetaOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      api.get<StudentProfile>("/student/profile"),
      api.get<MetaOptions>("/meta/options"),
    ])
      .then(([p, o]) => {
        if (p.status === "fulfilled") setProfile(p.value);
        else setError("Could not load your profile.");
        if (o.status === "fulfilled") setOptions(o.value);
      })
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof StudentProfile, v: string) =>
    setProfile((prev) => (prev ? { ...prev, [k]: v } : prev));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError("");
    setSaved(false);

    if (!profile.full_name?.trim()) {
      setError("Full name is required.");
      return;
    }

    setSaving(true);
    try {
      const updated = await api.patch<StudentProfile>("/student/profile", {
        full_name: profile.full_name.trim(),
        phone: profile.phone || null,
        whatsapp_number: profile.whatsapp_number || null,
        college_name: profile.college_name || null,
        course: profile.course || null,
        current_year: profile.current_year || null,
        skills: profile.skills || null,
        // resume_url is deliberately not sent: the upload field owns it, and
        // echoing a stale copy back would undo an upload made in another tab.
        linkedin_url: profile.linkedin_url || null,
        city: profile.city || null,
        bio: profile.bio || null,
      });
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">{error || "Profile unavailable."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">My Profile</h2>
          <span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent">
            {profile.completion_percent}% complete
          </span>
        </div>

        <form onSubmit={handleSave} className="space-y-5" noValidate>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                value={profile.full_name ?? ""}
                onChange={(e) => set("full_name", e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={profile.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>

            <div>
              <Label htmlFor="whatsapp_number">WhatsApp Number</Label>
              <Input
                id="whatsapp_number"
                type="tel"
                value={profile.whatsapp_number ?? ""}
                onChange={(e) => set("whatsapp_number", e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="college_name">College / University</Label>
              <Input
                id="college_name"
                value={profile.college_name ?? ""}
                onChange={(e) => set("college_name", e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="course">Course</Label>
              <Select
                value={profile.course ?? ""}
                onValueChange={(v) => set("course", v)}
              >
                <SelectTrigger id="course">
                  <SelectValue placeholder="Select your course" />
                </SelectTrigger>
                <SelectContent>
                  {(options?.courses ?? []).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="current_year">Current Year</Label>
              <Select
                value={profile.current_year ?? ""}
                onValueChange={(v) => set("current_year", v)}
              >
                <SelectTrigger id="current_year">
                  <SelectValue placeholder="Select your year" />
                </SelectTrigger>
                <SelectContent>
                  {(options?.current_years ?? []).map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={profile.city ?? ""}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Chennai"
              />
            </div>

            <div>
              <Label htmlFor="linkedin_url">LinkedIn Profile</Label>
              <Input
                id="linkedin_url"
                value={profile.linkedin_url ?? ""}
                onChange={(e) => set("linkedin_url", e.target.value)}
                placeholder="https://linkedin.com/in/you"
              />
            </div>

            {/* Uploads save immediately and on their own, so this sits outside
                the Save Changes flow -- the file is stored the moment it is
                chosen, not when the form is submitted. */}
            <div className="sm:col-span-2">
              <ResumeUploadField
                value={profile.resume_url}
                onUploaded={(updated) => {
                  setProfile(updated);
                  setError("");
                }}
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="skills">Skills</Label>
              <Input
                id="skills"
                value={profile.skills ?? ""}
                onChange={(e) => set("skills", e.target.value)}
                placeholder="React, Python, SQL (comma separated)"
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="bio">About You</Label>
              <Textarea
                id="bio"
                rows={4}
                value={profile.bio ?? ""}
                onChange={(e) => set("bio", e.target.value)}
                placeholder="A short introduction for companies reviewing your application..."
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
          )}
          {saved && (
            <p className="flex items-center gap-2 rounded-md bg-accent/10 p-3 text-sm text-accent">
              <CheckCircle2 className="h-4 w-4" />
              Profile saved.
            </p>
          )}

          <Button type="submit" variant="gradient" size="lg" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default Profile;
