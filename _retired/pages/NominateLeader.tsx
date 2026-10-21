import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const NominateLeader = () => {
    const { toast } = useToast();
    const apiBase = import.meta.env.VITE_API_URL || "";

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const formEl = e.currentTarget;
        const formData = Object.fromEntries(new FormData(formEl) as any);

        const payload = {
            leader_name: formData["leader-name"] || "",
            leader_title: formData["leader-title"] || "",
            leader_company: formData["leader-company"] || "",
            leader_email: formData["leader-email"] || "",
            leader_phone: formData["leader-phone"] || "",
        };

        if (!payload.leader_name) {
            toast({ title: "Please fill required fields", description: "Leader's name is required." });
            return;
        }

        try {
            const res = await fetch(`${apiBase}/applications/leader`, {
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
                title: "Nomination Submitted!",
                description: "We've received your leader nomination. Thank you!",
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
                            <h1 className="mb-6">Nominate a Leader</h1>
                            <p className="text-xl text-muted-foreground">
                                Know an inspiring leader? Nominate them to share their insights with our community.
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
                                            <h3 className="font-bold text-lg mb-4">Leader Information</h3>

                                            <div className="space-y-4">
                                                <div>
                                                    <Label htmlFor="leader-name">Leader's Name *</Label>
                                                    <Input id="leader-name" name="leader-name" placeholder="Full name" required />
                                                </div>

                                                <div>
                                                    <Label htmlFor="leader-title">Title/Role *</Label>
                                                    <Input id="leader-title" name="leader-title" placeholder="e.g., CEO, Director" required />
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
                        </div>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
};

export default NominateLeader;
