import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LeaderCard from "@/components/LeaderCard";
import { Button } from "@/components/ui/button";

interface Leader {
  id: number;
  leader_name: string;
  leader_title: string;
  leader_company: string;
  photo: string;
  linkedin_url?: string;
  why_nominate?: string;
}

const Leaders = () => {
  const [selectedIndustry, setSelectedIndustry] = useState("All");
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const apiBase = import.meta.env.VITE_API_URL || "";

  const industries = ["All", "Technology", "Finance", "Healthcare", "Education", "Consulting"];

  useEffect(() => {
    const fetchLeaders = async () => {
      try {
        const response = await fetch(`${apiBase}/leaders/approved`);
        if (response.ok) {
          const data = await response.json();
          setLeaders(data);
        } else {
          console.error("Failed to fetch leaders");
        }
      } catch (error) {
        console.error("Error fetching leaders:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaders();
  }, [apiBase]);

  const filteredLeaders =
    selectedIndustry === "All"
      ? leaders
      : leaders.filter((leader) => leader.leader_company?.toLowerCase().includes(selectedIndustry.toLowerCase()));

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center animate-fade-up">
              <h1 className="mb-6">Meet Our Leaders</h1>
              <p className="text-xl text-muted-foreground">
                Learn from CEOs, founders, and industry veterans who are shaping the future of business.
              </p>
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="py-8 border-b border-border">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap gap-3 justify-center">
              {industries.map((industry) => (
                <Button
                  key={industry}
                  variant={selectedIndustry === industry ? "default" : "outline"}
                  onClick={() => setSelectedIndustry(industry)}
                  size="sm"
                >
                  {industry}
                </Button>
              ))}
            </div>
          </div>
        </section>

        {/* Leaders Grid */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            {loading ? (
              <div className="text-center py-20">
                <p className="text-muted-foreground text-lg">Loading leaders...</p>
              </div>
            ) : (
              <>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {filteredLeaders.map((leader, index) => (
                    <div
                      key={leader.id}
                      className="animate-fade-up"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <LeaderCard
                        name={leader.leader_name}
                        title={leader.leader_title || "Leader"}
                        company={leader.leader_company || "Organization"}
                        topic={leader.why_nominate}
                        image={leader.photo || "https://via.placeholder.com/400"}
                        linkedinUrl={leader.linkedin_url}
                      />
                    </div>
                  ))}
                </div>

                {filteredLeaders.length === 0 && !loading && (
                  <div className="text-center py-20">
                    <p className="text-muted-foreground text-lg">
                      No leaders found in this category. Check back soon!
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
            <h2 className="mb-6 text-white">Want to Be Featured?</h2>
            <p className="text-xl mb-8 text-white/90 max-w-2xl mx-auto">
              If you're a leader with insights to share, we'd love to feature you on OutOfSyllabuss.
            </p>
            <Button variant="hero" size="lg" className="bg-white text-primary hover:bg-white/90">
              Nominate a Leader
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Leaders;
