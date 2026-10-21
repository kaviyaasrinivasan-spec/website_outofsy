import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { API_BASE, fileUrl } from "@/lib/api";
import type { StudentProfile } from "@/lib/types";

/** Mirrors ALLOWED_DOC_EXTS and MAX_UPLOAD_BYTES on the server. Kept in step by
 *  hand, so the browser rejects the obvious cases before a wasted round trip;
 *  the server remains the authority either way. */
const ACCEPT = ".pdf,.doc,.docx";
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

interface Props {
  /** Whatever is stored on the profile: an uploaded path or an older link. */
  value?: string | null;
  /** Immediate mode: the profile the server returns after a successful upload. */
  onUploaded?: (profile: StudentProfile) => void;
  /**
   * Deferred mode. Registration has no account yet, so there is nothing to
   * attach a file to -- the file is held here and the caller uploads it once
   * the account exists. Passing this switches the field into that mode.
   */
  onSelectFile?: (file: File | null) => void;
  /** Deferred mode: the file the caller is currently holding. */
  file?: File | null;
  label?: string;
}

/** The name to show for a stored resume. Uploads are uuid-named, so showing the
 *  raw filename would be noise -- only a pasted link is worth spelling out. */
const describe = (stored: string) =>
  /^https?:\/\//i.test(stored) ? "Linked resume" : "Your resume";

const ResumeUploadField = ({
  value,
  onUploaded,
  onSelectFile,
  file,
  label = "Resume",
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const deferred = typeof onSelectFile === "function";

  const handleFile = async (chosen: File | undefined) => {
    if (!chosen) return;
    setError("");

    if (chosen.size > MAX_RESUME_BYTES) {
      setError("That file is over 5 MB. Please upload a smaller one.");
      return;
    }

    if (deferred) {
      // Nothing to upload to yet -- hand it back and let the caller send it
      // once there is an account.
      onSelectFile!(chosen);
      return;
    }

    const form = new FormData();
    form.append("file", chosen);

    setUploading(true);
    try {
      // Raw fetch, not the api helper: that one sets a JSON content type, and
      // multipart needs the browser to set its own boundary.
      const res = await fetch(`${API_BASE}/student/resume`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail || "Upload failed.");
      onUploaded?.(body as StudentProfile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload your resume.");
    } finally {
      setUploading(false);
      // Cleared so choosing the same file again still fires a change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const hasSomething = deferred ? !!file : !!value;

  return (
    <div>
      <Label htmlFor="resume_file">{label}</Label>

      <input
        ref={inputRef}
        id="resume_file"
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <div className="mt-1 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              {hasSomething ? "Replace resume" : "Upload resume"}
            </>
          )}
        </Button>

        {/* Deferred: the file is only chosen, so name it and allow a change of
            mind. Immediate: it is already stored, so link to it. */}
        {deferred && file && (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <FileText className="h-4 w-4 text-accent" />
            {file.name}
            <button
              type="button"
              onClick={() => {
                onSelectFile!(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="ml-1 rounded p-0.5 hover:bg-muted"
              aria-label="Remove the chosen resume"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}

        {!deferred && value && !uploading && (
          <a
            href={fileUrl(value)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            <FileText className="h-4 w-4" /> {describe(value)}
          </a>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        PDF or Word document, up to 5 MB.
        {deferred && " It is saved once your account is created."}
      </p>

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
};

export default ResumeUploadField;
