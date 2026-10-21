import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Mail, MessageSquare, Phone, CheckCircle2, AlertTriangle,
  Loader2, Settings, Info,
} from "lucide-react";
import { api } from "@/lib/api";

/** The transactional emails the platform actually sends today, each tied to the
 *  event that triggers it. Kept in step with app/email_utils.py. */
const AUTOMATIC_EMAILS = [
  {
    name: "Application received",
    trigger: "A student submits an application",
    to: "The student",
  },
  {
    name: "Application status changed",
    trigger: "Staff or HR move an application to a new stage",
    to: "The student",
  },
  {
    name: "Internship confirmation",
    trigger: "A student applies through the public internship form",
    to: "The student",
  },
  {
    name: "Portal credentials",
    trigger: "An HR, coordinator or staff login is created",
    to: "The new portal user",
  },
];

interface ChannelState { configured: boolean; note: string | null }
interface Health {
  channels: { email: ChannelState; sms: ChannelState; whatsapp: ChannelState };
}

const CHANNEL_META = [
  { key: "email" as const, label: "Email / SMTP", icon: Mail },
  { key: "sms" as const, label: "SMS Gateway", icon: Phone },
  { key: "whatsapp" as const, label: "WhatsApp API", icon: MessageSquare },
];

const CommunicationCenter = () => {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Health>("/ops/settings/health")
      .then((res) => {
        setHealth(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Could not read the channel configuration.");
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Communication Center</h1>
        <p className="text-sm text-muted-foreground">
          Channel configuration and the automatic notifications the platform sends
        </p>
      </div>

      {/* Channel status -- read from the server, not assumed */}
      <div>
        <h3 className="mb-3 font-semibold text-slate-700">Channel Status</h3>
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : error ? (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {CHANNEL_META.map((c) => {
              const state = health?.channels?.[c.key];
              const ok = !!state?.configured;
              return (
                <Card key={c.key}>
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <c.icon className="h-4 w-4 text-slate-500" />
                        <span className="font-medium text-slate-800">{c.label}</span>
                      </div>
                      <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                        {ok ? "Configured" : "Not configured"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {state?.note || (ok ? "Credentials are present and this channel is in use." : "—")}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        <div className="mt-3">
          <Button asChild size="sm" variant="outline">
            <Link to="/ops/admin/master-data">
              <Settings className="mr-2 h-4 w-4" />Edit channel settings
            </Link>
          </Button>
        </div>
      </div>

      {/* What actually gets sent */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automatic Notifications</CardTitle>
          <p className="text-sm text-muted-foreground">
            These are sent by the platform on their own. There is nothing to schedule.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="p-4 text-left font-semibold text-slate-600">Notification</th>
                  <th className="p-4 text-left font-semibold text-slate-600">Sent when</th>
                  <th className="p-4 text-left font-semibold text-slate-600">Recipient</th>
                  <th className="p-4 text-left font-semibold text-slate-600">Channel</th>
                </tr>
              </thead>
              <tbody>
                {AUTOMATIC_EMAILS.map((e) => (
                  <tr key={e.name} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="p-4 font-medium text-slate-800">{e.name}</td>
                    <td className="p-4 text-slate-600">{e.trigger}</td>
                    <td className="p-4 text-slate-600">{e.to}</td>
                    <td className="p-4">
                      <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                        Email
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Honest about what is not built */}
      <Card>
        <CardContent className="flex items-start gap-3 p-5">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-slate-800">Bulk messaging is not available yet</p>
            <p className="text-muted-foreground">
              Composing a broadcast, saved templates and a send history all need server
              support that does not exist yet — there is no endpoint to send a bulk
              message and no table to record one. Rather than show a compose box that
              silently does nothing, this screen reports only what the platform really
              does. SMS and WhatsApp are configuration slots; no code sends through
              them today.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CommunicationCenter;
