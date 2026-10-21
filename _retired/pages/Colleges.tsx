import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Presentation, Calendar, Award, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";

const Colleges = () => {
  const benefits = [
    "Expert guest lectures from industry leaders",
    "Exclusive Q&A sessions with CEOs and founders",
    "Career guidance workshops for students",
    "Networking opportunities with professionals",
    "Free access to our video library",
    "Co-branded marketing and promotion",
  ];

  const formats = [
    {
      icon: Presentation,
      title: "Guest Lectures",
      description: "45-60 minute talks followed by Q&A sessions on campus or virtual.",
      duration: "1-2 hours",
    },
    {
      icon: Users,
      title: "Panel Discussions",
      description: "Multiple leaders sharing diverse perspectives on industry topics.",
      duration: "2-3 hours",
    },
    {
      icon: Calendar,
      title: "Workshop Series",
      description: "Multi-session programs covering career skills and leadership development.",
      duration: "4-6 sessions",
    },
    {
      icon: Award,
      title: "Mentorship Programs",
      description: "Ongoing connections between students and industry professionals.",
      duration: "1 semester",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 bg-gradient-to-r from-accent to-cyan text-white">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center animate-fade-up">
              <h1 className="mb-6 text-white">Partner With Us</h1>
              <p className="text-xl text-white/90 mb-8">
                Bring real-world wisdom to your campus. Let's inspire the next generation of leaders together.
              </p>
              <Button variant="hero" size="xl" className="bg-white text-primary hover:bg-white/90">
                Schedule a Call
              </Button>
            </div>
          </div>
        </section>

        {/* Why Partner */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-center mb-12">Why Partner With OutOfSyllabuss?</h2>
              
              <div className="grid md:grid-cols-2 gap-8 mb-12">
                <Card className="border-l-4 border-accent">
                  <CardContent className="p-6">
                    <h3 className="text-xl font-bold mb-3">For Your Students</h3>
                    <p className="text-muted-foreground">
                      Give your students direct access to industry leaders, practical career insights, and mentorship opportunities that complement their academic education.
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-cyan">
                  <CardContent className="p-6">
                    <h3 className="text-xl font-bold mb-3">For Your Institution</h3>
                    <p className="text-muted-foreground">
                      Enhance your college's reputation, improve student engagement, and strengthen industry connections through our established network of leaders.
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-gradient-subtle">
                <CardContent className="p-8">
                  <h3 className="text-xl font-bold mb-6 text-center">What's Included</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    {benefits.map((benefit, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 animate-fade-up"
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{benefit}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Engagement Formats */}
        <section className="py-20 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-center mb-12">Engagement Formats</h2>
              
              <div className="grid md:grid-cols-2 gap-8">
                {formats.map((format, index) => (
                  <Card
                    key={format.title}
                    className="hover-lift animate-fade-up"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <CardContent className="p-6">
                      <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-4">
                        <format.icon className="h-6 w-6 text-accent" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">{format.title}</h3>
                      <p className="text-muted-foreground mb-3">{format.description}</p>
                      <div className="inline-block px-3 py-1 bg-secondary rounded-full text-sm font-medium">
                        {format.duration}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-center mb-12">How It Works</h2>
              
              <div className="space-y-8">
                <div className="flex gap-6 items-start animate-fade-up">
                  <div className="w-12 h-12 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xl flex-shrink-0">
                    1
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">Initial Consultation</h3>
                    <p className="text-muted-foreground">
                      We'll schedule a call to understand your college's needs, student demographics, and preferred engagement format.
                    </p>
                  </div>
                </div>

                <div className="flex gap-6 items-start animate-fade-up" style={{ animationDelay: "0.1s" }}>
                  <div className="w-12 h-12 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xl flex-shrink-0">
                    2
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">Custom Program Design</h3>
                    <p className="text-muted-foreground">
                      We'll match the right leaders with your students' interests and design a program that fits your calendar.
                    </p>
                  </div>
                </div>

                <div className="flex gap-6 items-start animate-fade-up" style={{ animationDelay: "0.2s" }}>
                  <div className="w-12 h-12 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xl flex-shrink-0">
                    3
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">Seamless Execution</h3>
                    <p className="text-muted-foreground">
                      We handle all logistics, promotion, and coordination. You focus on maximizing student participation.
                    </p>
                  </div>
                </div>

                <div className="flex gap-6 items-start animate-fade-up" style={{ animationDelay: "0.3s" }}>
                  <div className="w-12 h-12 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xl flex-shrink-0">
                    4
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">Ongoing Partnership</h3>
                    <p className="text-muted-foreground">
                      Access to our content library, future events, and continued support for your students' development.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-gradient-to-r from-accent to-cyan text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="mb-6 text-white">Ready to Get Started?</h2>
            <p className="text-xl mb-8 text-white/90 max-w-2xl mx-auto">
              Let's bring real-world leadership education to your campus. Schedule a free consultation today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/contact">
                <Button variant="hero" size="xl" className="bg-white text-primary hover:bg-white/90 w-full sm:w-auto">
                  Schedule Consultation
                </Button>
              </Link>
              <Button variant="outline" size="xl" className="border-white text-white hover:bg-white/10 w-full sm:w-auto">
                Download Brochure
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Colleges;
