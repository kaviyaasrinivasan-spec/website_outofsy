import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Linkedin } from "lucide-react";

interface Ambassador {
    id: number;
    name: string;
    email: string;
    college: string;
    year: string;
    major: string;
    photo: string;
    linkedin_url?: string;
}

const StudentAmbassadors = () => {
    const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("All");
    const apiBase = import.meta.env.VITE_API_URL || "";

    useEffect(() => {
        const fetchAmbassadors = async () => {
            try {
                const response = await fetch(`${apiBase}/ambassadors/approved`);
                if (response.ok) {
                    const data = await response.json();
                    setAmbassadors(data);
                } else {
                    console.error("Failed to fetch ambassadors");
                }
            } catch (error) {
                console.error("Error fetching ambassadors:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAmbassadors();
    }, [apiBase]);

    // Fixed categories like Interviews page
    const categories = ["All", "Leadership", "Entrepreneurship", "Career Growth", "Innovation"];

    const filteredAmbassadors = ambassadors.filter((ambassador) => {
        const matchesSearch =
            ambassador.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ambassador.college.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ambassador.major?.toLowerCase().includes(searchQuery.toLowerCase());

        // Category filter is visual only - always show all ambassadors regardless of category
        return matchesSearch;
    });

    return (
        <div className="min-h-screen flex flex-col">
            <Navbar />

            <main className="flex-1">
                {/* Hero */}
                <section className="py-20 bg-gradient-subtle">
                    <div className="container mx-auto px-4">
                        <div className="max-w-3xl mx-auto text-center animate-fade-up">
                            <h1 className="mb-6">Student Ambassadors</h1>
                            <p className="text-xl text-muted-foreground mb-8">
                                Meet the passionate students bringing OutOfSyllabuss to campuses worldwide.
                            </p>

                            {/* Search */}
                            <div className="relative max-w-xl mx-auto">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                <Input
                                    placeholder="Search ambassadors..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Category Filters */}
                <section className="py-8 border-b border-border">
                    <div className="container mx-auto px-4">
                        <div className="flex flex-wrap gap-3 justify-center">
                            {categories.map((category) => (
                                <Button
                                    key={category}
                                    variant={selectedCategory === category ? "default" : "outline"}
                                    onClick={() => setSelectedCategory(category)}
                                    size="sm"
                                >
                                    {category}
                                </Button>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Ambassadors Grid */}
                <section className="py-20">
                    <div className="container mx-auto px-4">
                        {loading ? (
                            <div className="text-center py-20">
                                <p className="text-muted-foreground text-lg">Loading ambassadors...</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                    {filteredAmbassadors.map((ambassador, index) => (
                                        <Card
                                            key={ambassador.id}
                                            className="overflow-hidden hover-lift group animate-fade-up"
                                            style={{ animationDelay: `${index * 0.05}s` }}
                                        >
                                            <div className="relative aspect-square overflow-hidden">
                                                <img
                                                    src={ambassador.photo || "https://via.placeholder.com/400"}
                                                    alt={ambassador.name}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                            </div>
                                            <CardContent className="p-6">
                                                <div className="flex items-start justify-between mb-1">
                                                    <h3 className="font-bold text-lg">{ambassador.name}</h3>
                                                    {ambassador.linkedin_url && (
                                                        <a
                                                            href={ambassador.linkedin_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-accent hover:text-accent/80 transition-colors"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <Linkedin className="h-5 w-5" />
                                                        </a>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground mb-1">{ambassador.college}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {ambassador.year} {ambassador.major && `• ${ambassador.major}`}
                                                </p>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>

                                {filteredAmbassadors.length === 0 && !loading && (
                                    <div className="text-center py-20">
                                        <p className="text-muted-foreground text-lg">
                                            No ambassadors found. Try adjusting your search.
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </section>

                {/* CTA */}
                <section className="py-20 bg-gradient-to-r from-accent to-cyan text-white">
                    <div className="container mx-auto px-4 text-center">
                        <h2 className="mb-6 text-white">Become an Ambassador</h2>
                        <p className="text-xl mb-8 text-white/90 max-w-2xl mx-auto">
                            Join our community of student leaders and bring OutOfSyllabuss to your campus.
                        </p>
                        <a href="/join">
                            <Button variant="secondary" size="lg" className="bg-white text-primary hover:bg-white/90">
                                Apply Now
                            </Button>
                        </a>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
};

export default StudentAmbassadors;
