import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Users, Award, Heart } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const Join = () => {
  const { toast } = useToast();
  const apiBase = import.meta.env.VITE_API_URL || "";

  const [selectedForm, setSelectedForm] = useState<"student" | "leader" | "volunteer" | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>, formType: "student" | "leader" | "volunteer") => {
    e.preventDefault();

    const formEl = e.currentTarget;
    // FormData requires inputs to have `name` attributes (see section 4 below)
    const formData = Object.fromEntries(new FormData(formEl) as any);

    let endpoint = "";
    let payload: any = formData;

    if (formType === "student") {
      endpoint = "/applications/student";
      if (!payload.name || !payload.email) {
        toast({ title: "Please fill required fields", description: "Name and email are required." });
        return;
      }
    } else if (formType === "leader") {
      endpoint = "/applications/leader";
      payload = {
        leader_name: payload["leader-name"] || "",
        leader_title: payload["leader-title"] || "",
        leader_company: payload["leader-company"] || "",
        leader_email: payload["leader-email"] || "",
        leader_phone: payload["leader-phone"] || "",
      };
      if (!payload.leader_name) {
        toast({ title: "Please fill required fields", description: "Leader's name is required." });
        return;
      }
    } else {
      endpoint = "/applications/volunteer";
      payload = {
        name: payload["vol-name"] || payload["vol_name"] || "",
        email: payload["vol-email"] || payload["vol_email"] || "",
        phone: payload["vol-phone"] || "",
        location: payload["location"] || "",
      };
      if (!payload.name || !payload.email) {
        toast({ title: "Please fill required fields", description: "Name and email are required." });
        return;
      }
    }

    try {
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        toast({ title: "Submission failed", description: err || "Server returned an error." });
        return;
      }

      await res.json();
      toast({
        title: "Application Submitted!",
        description: `We've received your ${formType} application. We'll be in touch soon!`,
      });

      formEl.reset();
      setSelectedForm(null);
    } catch (error: any) {
      console.error(error);
      toast({ title: "Network error", description: "Could not submit. Check your backend URL and CORS." });
    }
  };


  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 pb-4 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center animate-fade-up">
              <h1 className="mb-6">Join the Movement</h1>
              <p className="text-xl text-muted-foreground">
                Be part of a community that's reshaping how students learn from industry leaders.
              </p>
            </div>
          </div>
        </section>

        {/* Options */}
        {!selectedForm && (
          <section className="py-4">
            <div className="container mx-auto px-4">
              <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                <Card className="hover-lift cursor-pointer" onClick={() => setSelectedForm("student")}>
                  <CardContent className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
                      <Users className="h-8 w-8 text-accent" />
                    </div>
                    <h3 className="text-xl font-bold mb-3">Campus Ambassador</h3>
                    <p className="text-muted-foreground mb-6">
                      Bring OutOfSyllabuss to your college and earn recognition as a student leader.
                    </p>
                    <Button variant="hero" className="w-full">Apply Now</Button>
                  </CardContent>
                </Card>

                <Card className="hover-lift cursor-pointer" onClick={() => setSelectedForm("leader")}>
                  <CardContent className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cyan/10 flex items-center justify-center">
                      <Award className="h-8 w-8 text-cyan" />
                    </div>
                    <h3 className="text-xl font-bold mb-3">Nominate a Leader</h3>
                    <p className="text-muted-foreground mb-6">
                      Know a CEO, founder, or leader who should share their story? Nominate them.
                    </p>
                    <Button variant="hero" className="w-full">Nominate</Button>
                  </CardContent>
                </Card>

                <Card className="hover-lift cursor-pointer" onClick={() => setSelectedForm("volunteer")}>
                  <CardContent className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
                      <Heart className="h-8 w-8 text-accent" />
                    </div>
                    <h3 className="text-xl font-bold mb-3">Colleges & Institutions</h3>
                    <p className="text-muted-foreground mb-6">
                      Support our mission by helping with events, content, or <br></br>operations.
                    </p>
                    <Button variant="hero" className="w-full">Get Involved</Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>
        )}

        {/* Forms */}
        {selectedForm && (
          <section className="py-20">
            <div className="container mx-auto px-4">
              <div className="max-w-2xl mx-auto">

                {selectedForm === "student" && (
                  <Card>
                    <CardContent className="p-8">
                      <h2 className="text-3xl font-bold mb-6">Campus Ambassador Application</h2>
                      <form onSubmit={(e) => handleSubmit(e, "student")} className="space-y-6">
                        <div>
                          <Label htmlFor="name">Full Name *</Label>
                          <Input id="name" name="name" placeholder="Your name" required />
                        </div>

                        <div>
                          <Label htmlFor="email">Email Address *</Label>
                          <Input id="email" name="email" type="email" placeholder="your.email@college.edu" required />
                        </div>

                        <div>
                          <Label htmlFor="phone">Phone Number</Label>
                          <Input id="phone" name="phone" type="tel" placeholder="+1 (555) 123-4567" />
                        </div>

                        <div>
                          <Label htmlFor="college">College/University *</Label>
                          <Input id="college" name="college" placeholder="Your institution" required />
                        </div>

                        <div>
                          <Label htmlFor="year">Year of Study *</Label>
                          <Input id="year" name="year" placeholder="e.g., Sophomore, Junior" required />
                        </div>

                        <div>
                          <Label htmlFor="major">Major/Field of Study</Label>
                          <Input id="major" name="major" placeholder="Your major" />
                        </div>


                        <Button type="submit" variant="gradient" size="lg" className="w-full">
                          Submit Application
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                )}

                {selectedForm === "leader" && (
                  <Card>
                    <CardContent className="p-8">
                      <h2 className="text-3xl font-bold mb-6">Nominate a Leader</h2>
                      <form onSubmit={(e) => handleSubmit(e, "leader")} className="space-y-6">
                        <div>
                          <h3 className="font-bold text-lg mb-4">Leader Information</h3>

                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="leader-name">Leader's Name *</Label>
                              <Input id="leader-name" name="leader-name" placeholder="Full name" required />
                            </div>

                            <div>
                              <Label htmlFor="leader-title">Title/Role *</Label>
                              <Input id="leader-title" name="leader-title" placeholder="Title/Role" required />
                            </div>

                            <div>
                              <Label htmlFor="leader-company">Company/Organization *</Label>
                              <Input id="leader-company" name="leader-company" placeholder="Company name" required />
                            </div>

                            <div>
                              <Label htmlFor="leader-email">Leader's Email (if known)</Label>
                              <Input id="leader-email" name="leader-email" type="email" placeholder="leader@company.com" />
                            </div>

                            <div>
                              <Label htmlFor="leader-phone">Leader's Mobile Number</Label>
                              <Input id="leader-phone" name="leader-phone" type="tel" placeholder="+1 (555) 123-4567" />
                            </div>

                          </div>
                        </div>

                        <Button type="submit" variant="gradient" size="lg" className="w-full">
                          Submit Nomination
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                )}

                {selectedForm === "volunteer" && (
                  <Card>
                    <CardContent className="p-8">
                      <h2 className="text-3xl font-bold mb-6">Colleges & Institutions</h2>
                      <form onSubmit={(e) => handleSubmit(e, "volunteer")} className="space-y-6">
                        <div>
                          <Label htmlFor="vol-name">College Name *</Label>
                          <Input id="vol-name" name="vol-name" placeholder="college name" required />
                        </div>

                        <div>
                          <Label htmlFor="vol-email">College Email Address *</Label>
                          <Input id="vol-email" name="vol-email" type="college email" placeholder="your.email@example.com" required />
                        </div>

                        <div>
                          <Label htmlFor="vol-phone">Phone Number</Label>
                          <Input id="vol-phone" name="vol-phone" type="tel" placeholder="+1 (555) 123-4567" />
                        </div>

                        <div>
                          <Label htmlFor="location">Location (City, State/Country)</Label>
                          <Input id="location" name="location" placeholder="Where are you based?" />
                        </div>

                        <Button type="submit" variant="gradient" size="lg" className="w-full">
                          Submit Application
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Benefits */}
        {!selectedForm && (
          <section className="py-20 bg-gradient-subtle">
            <div className="container mx-auto px-4">
              <div className="max-w-4xl mx-auto">
                <h2 className="text-center mb-12">Why Join?</h2>
                <div className="grid md:grid-cols-3 gap-8">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-gradient mb-2">Network</div>
                    <p className="text-muted-foreground">Connect with leaders, students, and change-makers</p>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-gradient mb-2">Impact</div>
                    <p className="text-muted-foreground">Shape the future of student leadership education</p>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-gradient mb-2">Grow</div>
                    <p className="text-muted-foreground">Develop skills and gain valuable experience</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Join;
