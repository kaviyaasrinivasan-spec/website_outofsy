import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const AmbassadorApplication = () => {
    const { toast } = useToast();
    const apiBase = import.meta.env.VITE_API_URL || "";

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const formEl = e.currentTarget;
        const formData = Object.fromEntries(new FormData(formEl) as any);

        if (!formData.name || !formData.email) {
            toast({ title: "Please fill required fields", description: "Name and email are required." });
            return;
        }

        try {
            const res = await fetch(`${apiBase}/applications/student`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            if (!res.ok) {
                const err = await res.text();
                toast({ title: "Submission failed", description: err || "Server returned an error." });
                return;
            }

            await res.json();
            toast({
                title: "Application Submitted!",
                description: "We've received your application. We'll be in touch soon!",
            });

            formEl.reset();
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
                <section className="py-12 bg-gradient-subtle">
                    <div className="container mx-auto px-4">
                        <div className="max-w-3xl mx-auto text-center animate-fade-up">
                            <h1 className="mb-6">Campus Ambassador Application</h1>
                            <p className="text-xl text-muted-foreground">
                                Join our community of student leaders and bring OutOfSyllabuss to your campus.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Form */}
                <section className="py-6">
                    <div className="container mx-auto px-4">
                        <div className="max-w-2xl mx-auto">
                            <Card>
                                <CardContent className="p-8">
                                    <form onSubmit={handleSubmit} className="space-y-6">
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
                        </div>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
};

export default AmbassadorApplication;
