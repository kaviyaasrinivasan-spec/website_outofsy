import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, Mail, MapPin, Phone } from "lucide-react";
import { api, ApiError } from "@/lib/api";

const Contact = () => {
  const [values, setValues] = useState({ name: "", email: "", subject: "", message: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (k: keyof typeof values, v: string) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!values.name.trim()) return setError("Please enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
      return setError("Please enter a valid email address.");
    if (!values.message.trim()) return setError("Please enter a message.");

    setSubmitting(true);
    try {
      // Unlike the previous version, this actually persists the message.
      await api.post("/contact", {
        name: values.name.trim(),
        email: values.email.trim(),
        subject: values.subject.trim() || undefined,
        message: values.message.trim(),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send your message.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="bg-gradient-subtle py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl animate-fade-up text-center">
              <h1 className="mb-6">Contact Us</h1>
              <p className="text-xl text-muted-foreground">
                Questions about internships or membership? We'd love to hear from you.
              </p>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
              <div className="space-y-6">
                <Card className="hover-lift">
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                      <Mail className="h-6 w-6 text-accent" />
                    </div>
                    <h3 className="mb-2 font-bold">Email</h3>
                    <a
                      href="mailto:team@outofsyllabuss.org"
                      className="break-all text-muted-foreground transition-colors hover:text-accent"
                    >
                      team@outofsyllabuss.org
                    </a>
                  </CardContent>
                </Card>

                <Card className="hover-lift">
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cyan/10">
                      <Phone className="h-6 w-6 text-cyan" />
                    </div>
                    <h3 className="mb-2 font-bold">Phone</h3>
                    <a
                      href="tel:+918939518163"
                      className="text-muted-foreground transition-colors hover:text-cyan"
                    >
                      +91 89395 18163
                    </a>
                  </CardContent>
                </Card>

                <Card className="hover-lift">
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                      <MapPin className="h-6 w-6 text-accent" />
                    </div>
                    <h3 className="mb-2 font-bold">Office</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Workvilla, 110/1 &ldquo;Arcade Centre&rdquo;,
                      <br />
                      Mahatma Gandhi Road, Nungambakkam,
                      <br />
                      Chennai 600034
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="md:col-span-2">
                <Card>
                  <CardContent className="p-8">
                    {sent ? (
                      <div className="py-8 text-center">
                        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
                          <CheckCircle2 className="h-9 w-9 text-accent" />
                        </div>
                        <h2 className="mb-3 text-2xl font-bold">Message Sent</h2>
                        <p className="mb-6 text-muted-foreground">
                          Thanks for reaching out. Our team will get back to you shortly.
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSent(false);
                            setValues({ name: "", email: "", subject: "", message: "" });
                          }}
                        >
                          Send Another Message
                        </Button>
                      </div>
                    ) : (
                      <>
                        <h2 className="mb-6 text-2xl font-bold">Send Us a Message</h2>
                        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                          <div>
                            <Label htmlFor="name">Full Name *</Label>
                            <Input
                              id="name"
                              value={values.name}
                              onChange={(e) => set("name", e.target.value)}
                              placeholder="Your name"
                            />
                          </div>

                          <div>
                            <Label htmlFor="email">Email Address *</Label>
                            <Input
                              id="email"
                              type="email"
                              value={values.email}
                              onChange={(e) => set("email", e.target.value)}
                              placeholder="you@example.com"
                            />
                          </div>

                          <div>
                            <Label htmlFor="subject">Subject</Label>
                            <Input
                              id="subject"
                              value={values.subject}
                              onChange={(e) => set("subject", e.target.value)}
                              placeholder="What is this regarding?"
                            />
                          </div>

                          <div>
                            <Label htmlFor="message">Message *</Label>
                            <Textarea
                              id="message"
                              rows={6}
                              value={values.message}
                              onChange={(e) => set("message", e.target.value)}
                              placeholder="Tell us more..."
                            />
                          </div>

                          {error && (
                            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                              {error}
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
                                Sending...
                              </>
                            ) : (
                              "Send Message"
                            )}
                          </Button>
                        </form>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;
