import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Linkedin } from "lucide-react";

interface LeaderCardProps {
  name: string;
  title: string;
  company: string;
  topic?: string;
  image: string;
  videoUrl?: string;
  linkedinUrl?: string;
}

const LeaderCard = ({ name, title, company, topic, image, videoUrl, linkedinUrl }: LeaderCardProps) => {
  return (
    <Card className="overflow-hidden hover-lift group">
      <div className="relative aspect-square overflow-hidden">
        <img
          src={image}
          alt={`${name} - ${title} at ${company}`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {videoUrl && (
          <div className="absolute inset-0 bg-primary/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <Button variant="hero" size="icon" className="rounded-full h-16 w-16">
              <Play className="h-8 w-8" />
            </Button>
          </div>
        )}
      </div>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-1">
          <h3 className="font-bold text-xl">{name}</h3>
          {linkedinUrl && (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent/80 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Linkedin className="h-5 w-5" />
            </a>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-2">
          {title} at {company}
        </p>
        {topic && <p className="text-sm font-medium text-accent">{topic}</p>}
      </CardContent>
    </Card>
  );
};

export default LeaderCard;
