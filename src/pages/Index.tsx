import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import InternshipCardItem from "@/components/InternshipCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Award, BadgeCheck, Briefcase, ClipboardList, Compass, GraduationCap,
  Loader2, Quote, Rocket, ShieldCheck, TrendingUp, UserPlus,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import heroJourney from "@/assets/hero-journey.jpg";
import heroImage from "@/assets/hero-image.jpg";
import type { InternshipCard, InternshipListResponse, PlatformStats, SuccessStory } from "@/lib/types";

const WHY_OOS = [
  { icon: ShieldCheck, title: "Verified Opportunities", body: "Every internship is checked before it reaches you — no spam, no fake listings." },
  { icon: Rocket, title: "Real Industry Experience", body: "Work on live projects and build the practical skills your syllabus doesn't cover." },
  { icon: TrendingUp, title: "Job-Ready Skills", body: "Develop the capabilities employers actually hire for, before you graduate." },
  { icon: ClipboardList, title: "Track Everything", body: "Follow every application from submitted to selected in one dashboard." },
  { icon: Award, title: "Free OOS Membership", body: "Registration is free, and every student becomes an OOS Member instantly." },
  { icon: Compass, title: "Career Guidance", body: "Get direction on where to start and how to grow in your chosen field." },
];

const HOW_IT_WORKS = [
  { icon: UserPlus, step: "01", title: "Register", body: "Create your free account and become an OOS Member in under a minute." },
  { icon: GraduationCap, step: "02", title: "Complete Your Profile", body: "Add your course, skills and resume so companies can see your strengths." },
  { icon: Briefcase, step: "03", title: "Apply to Internships", body: "Browse verified openings and apply to the ones that fit you." },
  { icon: BadgeCheck, step: "04", title: "Get Placed", body: "Track your applications and land real industry experience before final semester." },
];

const FAQS = [
  { q: "Is OOS free for students?", a: "Yes. Registration and OOS membership are completely free. You can browse internships, apply, and track your applications at no cost." },
  { q: "Who can register on OOS?", a: "Any student currently studying, or recently passed out, can register. You'll be asked for your college, course and current year so we can match you with suitable opportunities." },
  { q: "Do I need an account to view internships?", a: "No. Anyone can browse all active internship programs. You only need an account when you want to apply, save an internship, or track your applications." },
  { q: "How do I know the internships are genuine?", a: "Every company and internship listing is reviewed by our team before it goes live. Listings that fail verification are never published." },
  { q: "What happens after I apply?", a: "Your application goes to the company for review. You'll see the status update in your dashboard — applied, under review, shortlisted, or selected — and get a notification each time it changes." },
  { q: "Can I apply to more than one internship?", a: "Yes, you can apply to as many internships as you like. You can only apply once per internship. If you change your mind about an application, contact our team and we will update it for you." },
];

const Index = () => {
  const { user } = useAuth();
  const isStudent = user?.role === "student";

  const [featured, setFeatured] = useState<InternshipCard[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [stories, setStories] = useState<SuccessStory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Each section degrades independently -- one failure shouldn't blank the page.
    Promise.allSettled([
      api.get<InternshipListResponse>("/internships?page_size=6"),
      api.get<PlatformStats>("/stats"),
      api.get<SuccessStory[]>("/success-stories"),
    ])
      .then(([f, s, st]) => {
        if (f.status === "fulfilled") setFeatured(f.value.items);
        if (s.status === "fulfilled") setStats(s.value);
        if (st.status === "fulfilled") setStories(st.value);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img src={heroImage} alt="" aria-hidden className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-primary/95 via-primary/85 to-primary/70" />
          </div>

          <div className="container relative z-10 mx-auto px-4 py-16 lg:py-20">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div className="animate-fade-up">
                <h1 className="mb-5 text-white">Get Placed Before Your Final Semester Ends.</h1>
                <p className="mb-8 text-lg text-white/90 md:text-xl">
                  Out Of Syllabus helps you gain real industry experience through verified
                  internships — so you graduate with more than just a degree.
                </p>
                <div className="flex flex-col gap-4 sm:flex-row">
                  <Link to="/internships">
                    <Button variant="gradient" size="xl" className="w-full sm:w-auto">
                      Browse Internships
                    </Button>
                  </Link>
                  {!user && (
                    <Link to="/register">
                      <Button
                        variant="hero"
                        size="xl"
                        className="w-full bg-white text-primary hover:bg-white/90 sm:w-auto"
                      >
                        Become an OOS Member
                      </Button>
                    </Link>
                  )}
                </div>

                {stats && (
                  <div className="mt-10 flex flex-wrap gap-8">
                    {[
                      { value: stats.active_internships, label: "Active Internships" },
                      // Counts every company, not just the verified ones, so
                      // the label says registered rather than verified.
                      { value: stats.companies, label: "Companies Registered" },
                      { value: stats.students, label: "Students Registered" },
                    ].map((s) => (
                      <div key={s.label}>
                        <div className="text-3xl font-bold text-white">{s.value}</div>
                        <div className="text-sm text-white/70">{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="animate-fade-up lg:justify-self-end">
                <img
                  src={heroJourney}
                  alt="The OOS journey in three steps: internship, acquire job-ready skills, get placed."
                  className="w-full max-w-lg rounded-xl shadow-2xl ring-1 ring-white/10"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Featured internships */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="mb-12 text-center">
              <h2 className="mb-4">Featured Internship Programs</h2>
              <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
                Verified openings from companies hiring students right now.
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
              </div>
            ) : featured.length === 0 ? (
              <div className="py-12 text-center">
                <Briefcase className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
                <p className="text-muted-foreground">
                  New internship programs are being added. Check back shortly.
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {featured.map((i) => (
                    <InternshipCardItem key={i.id} internship={i} />
                  ))}
                </div>
                <div className="mt-10 text-center">
                  <Link to="/internships">
                    <Button variant="outline" size="lg">
                      View All Internships
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Why choose OOS */}
        <section className="bg-gradient-subtle py-20">
          <div className="container mx-auto px-4">
            <div className="mb-12 text-center">
              <h2 className="mb-4">Why Choose OOS</h2>
              <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
                We believe every student should graduate with industry experience, not just
                academic knowledge.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {WHY_OOS.map(({ icon: Icon, title, body }) => (
                <Card key={title} className="hover-lift">
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                      <Icon className="h-6 w-6 text-accent" />
                    </div>
                    <h3 className="mb-2 text-lg font-bold">{title}</h3>
                    <p className="text-muted-foreground">{body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How OOS works */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="mb-12 text-center">
              <h2 className="mb-4">How OOS Works</h2>
              <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
                Four steps from signing up to getting placed.
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {HOW_IT_WORKS.map(({ icon: Icon, step, title, body }) => (
                <div key={step} className="relative text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-accent to-cyan">
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <div className="mb-1 text-sm font-bold text-accent">{step}</div>
                  <h3 className="mb-2 text-lg font-bold">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Success stories -- only rendered when admin has published some */}
        {stories.length > 0 && (
          <section className="bg-gradient-subtle py-20">
            <div className="container mx-auto px-4">
              <div className="mb-12 text-center">
                <h2 className="mb-4">Student Success Stories</h2>
                <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
                  Students who gained real experience through OOS.
                </p>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {stories.map((s) => (
                  <Card key={s.id} className="hover-lift">
                    <CardContent className="p-6">
                      <Quote className="mb-4 h-8 w-8 text-accent/30" />
                      <p className="mb-5 italic leading-relaxed text-muted-foreground">
                        &ldquo;{s.quote}&rdquo;
                      </p>
                      <div className="flex items-center gap-3">
                        {s.photo_url ? (
                          <img
                            src={s.photo_url}
                            alt={s.student_name}
                            className="h-11 w-11 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10">
                            <GraduationCap className="h-5 w-5 text-accent" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-bold">{s.student_name}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {[s.role, s.company_name].filter(Boolean).join(" at ") ||
                              s.college_name}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Membership benefits */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-4xl">
              <div className="mb-12 text-center">
                <h2 className="mb-4">Membership Benefits</h2>
                <p className="text-xl text-muted-foreground">
                  Every registered student becomes an OOS Member — free, forever.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  "Verified internship opportunities",
                  "Career guidance",
                  "Skill development programs",
                  "Exclusive internship openings",
                  "Industry updates",
                  "Community events",
                ].map((b) => (
                  <div key={b} className="flex items-center gap-3 rounded-lg bg-secondary p-4">
                    <BadgeCheck className="h-5 w-5 shrink-0 text-accent" />
                    <span className="font-medium">{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-gradient-subtle py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <div className="mb-12 text-center">
                <h2 className="mb-4">Frequently Asked Questions</h2>
              </div>
              <Accordion type="single" collapsible className="w-full">
                {FAQS.map((f, i) => (
                  <AccordionItem key={f.q} value={`item-${i}`}>
                    <AccordionTrigger className="text-left font-bold">{f.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        {!user && (
          <section className="bg-gradient-to-r from-accent to-cyan py-20 text-white">
            <div className="container mx-auto px-4 text-center">
              <h2 className="mb-6 text-white">Start Your Career Journey Today</h2>
              <p className="mx-auto mb-8 max-w-2xl text-xl text-white/90">
                Join OOS for free and get access to verified internships before your final
                semester ends.
              </p>
              <Link to="/register">
                <Button variant="hero" size="xl" className="bg-white text-primary hover:bg-white/90">
                  Register as a Student
                </Button>
              </Link>
            </div>
          </section>
        )}

        {isStudent && (
          <section className="bg-gradient-to-r from-accent to-cyan py-16 text-white">
            <div className="container mx-auto px-4 text-center">
              <h2 className="mb-4 text-white">Welcome back!</h2>
              <p className="mb-8 text-xl text-white/90">
                Pick up where you left off in your dashboard.
              </p>
              <Link to="/dashboard">
                <Button variant="hero" size="xl" className="bg-white text-primary hover:bg-white/90">
                  Go to Dashboard
                </Button>
              </Link>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Index;
