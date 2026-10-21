import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BadgeCheck, Eye, Target } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const MISSION_POINTS = [
  "Discover verified internship opportunities",
  "Become an OOS member",
  "Apply for internships",
  "Gain practical industry experience",
  "Build job-ready skills",
  "Track internship applications",
  "Connect with future career opportunities",
];

const About = () => {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="bg-gradient-subtle py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl animate-fade-up text-center">
              <h1 className="mb-6">About Out Of Syllabus</h1>
              <p className="text-xl leading-relaxed text-muted-foreground">
                A student-first career platform designed to help students gain practical
                experience through internships before graduation.
              </p>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-4xl">
              <div className="mb-12 grid gap-8 md:grid-cols-2">
                <Card className="border-l-4 border-accent">
                  <CardContent className="p-8">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                      <Target className="h-6 w-6 text-accent" />
                    </div>
                    <h2 className="mb-3 text-2xl font-bold">Our Mission</h2>
                    <p className="leading-relaxed text-muted-foreground">
                      To bridge the gap between education and industry by giving every student
                      practical experience before they enter the workforce. We believe every
                      student should graduate with industry experience, not just academic
                      knowledge.
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-cyan">
                  <CardContent className="p-8">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cyan/10">
                      <Eye className="h-6 w-6 text-cyan" />
                    </div>
                    <h2 className="mb-3 text-2xl font-bold">Our Vision</h2>
                    <p className="leading-relaxed text-muted-foreground">
                      To ensure every student enters the workforce with real industry exposure
                      and the confidence that comes with it — placed before their final
                      semester ends.
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-gradient-subtle">
                <CardContent className="p-8">
                  <h2 className="mb-6 text-center text-2xl font-bold">
                    What students can do through OOS
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {MISSION_POINTS.map((point) => (
                      <div key={point} className="flex items-start gap-3">
                        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                        <span className="text-muted-foreground">{point}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-r from-accent to-cyan py-20 text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="mb-6 text-white">
              {user ? "Explore Active Internships" : "Ready to Get Started?"}
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-xl text-white/90">
              {user
                ? "Browse verified opportunities and apply in a couple of clicks."
                : "Register free, become an OOS Member, and start applying for verified internships."}
            </p>
            <Link to={user ? "/internships" : "/register"}>
              <Button variant="hero" size="xl" className="bg-white text-primary hover:bg-white/90">
                {user ? "Browse Internships" : "Register as a Student"}
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default About;
