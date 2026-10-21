import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Play } from "lucide-react";
import leader1 from "@/assets/leader-1.jpg";
import leader2 from "@/assets/leader-2.jpg";
import leader3 from "@/assets/leader-3.jpg";

const Interviews = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const categories = ["All", "Leadership", "Entrepreneurship", "Career Growth", "Innovation"];

  const interviews = [
    {
      id: 1,
      title: "Building Resilient Teams in Uncertain Times",
      leader: "Sarah Chen",
      company: "TechVision Inc",
      duration: "45 min",
      thumbnail: leader1,
      category: "Leadership",
      date: "March 2024",
    },
    {
      id: 2,
      title: "The Startup Mindset: From Idea to Execution",
      leader: "Marcus Rodriguez",
      company: "GrowthLab",
      duration: "38 min",
      thumbnail: leader2,
      category: "Entrepreneurship",
      date: "February 2024",
    },
    {
      id: 3,
      title: "Executive Presence & Effective Communication",
      leader: "James Wellington",
      company: "Leadership Academy",
      duration: "52 min",
      thumbnail: leader3,
      category: "Career Growth",
      date: "February 2024",
    },
    {
      id: 4,
      title: "Innovation in the Digital Age",
      leader: "Sarah Chen",
      company: "TechVision Inc",
      duration: "41 min",
      thumbnail: leader1,
      category: "Innovation",
      date: "January 2024",
    },
    {
      id: 5,
      title: "Scaling Your Business Without Losing Culture",
      leader: "Marcus Rodriguez",
      company: "GrowthLab",
      duration: "47 min",
      thumbnail: leader2,
      category: "Entrepreneurship",
      date: "January 2024",
    },
    {
      id: 6,
      title: "Leading with Purpose and Authenticity",
      leader: "James Wellington",
      company: "Leadership Academy",
      duration: "43 min",
      thumbnail: leader3,
      category: "Leadership",
      date: "December 2023",
    },
  ];

  const filteredInterviews = interviews.filter((interview) => {
    const matchesSearch =
      interview.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      interview.leader.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || interview.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center animate-fade-up">
              <h1 className="mb-6">Interviews & Conversations</h1>
              <p className="text-xl text-muted-foreground mb-8">
                Watch in-depth conversations with industry leaders sharing their real-world experiences.
              </p>

              {/* Search */}
              <div className="relative max-w-xl mx-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Search interviews..."
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

        {/* Interviews Grid */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredInterviews.map((interview, index) => (
                <Card
                  key={interview.id}
                  className="overflow-hidden hover-lift group animate-fade-up"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="relative aspect-video overflow-hidden">
                    <img
                      src={interview.thumbnail}
                      alt={interview.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-primary/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <Button variant="hero" size="icon" className="rounded-full h-16 w-16">
                        <Play className="h-8 w-8" />
                      </Button>
                    </div>
                    <div className="absolute top-4 right-4 bg-primary/80 backdrop-blur-sm text-primary-foreground px-3 py-1 rounded-full text-xs font-medium">
                      {interview.duration}
                    </div>
                  </div>
                  <CardContent className="p-6">
                    <div className="inline-block px-2 py-1 bg-accent/10 text-accent text-xs font-medium rounded mb-2">
                      {interview.category}
                    </div>
                    <h3 className="font-bold text-lg mb-2">{interview.title}</h3>
                    <p className="text-sm text-muted-foreground mb-1">
                      {interview.leader} • {interview.company}
                    </p>
                    <p className="text-xs text-muted-foreground">{interview.date}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredInterviews.length === 0 && (
              <div className="text-center py-20">
                <p className="text-muted-foreground text-lg">
                  No interviews found. Try adjusting your search or filters.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* YouTube Playlist */}
        <section className="py-20 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="mb-6">Watch on YouTube</h2>
              <p className="text-xl text-muted-foreground mb-8">
                Subscribe to our channel for new interviews every week.
              </p>
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center mb-6">
                <div className="text-center">
                  <p className="text-muted-foreground mb-4">YouTube playlist embed</p>
                </div>
              </div>
              <Button variant="gradient" size="lg">
                Subscribe on YouTube
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Interviews;
