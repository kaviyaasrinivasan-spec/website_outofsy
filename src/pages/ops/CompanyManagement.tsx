import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, Download, Edit, Eye, Globe,
  Phone, Mail, Star, Building2, CheckCircle2, XCircle,
  FileText, Loader2,
} from "lucide-react";
import { api } from "@/lib/api";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  inactive: "bg-slate-100 text-slate-600",
};

interface CompanyItem {
  id: number;
  name: string;
  industry: string | null;
  website: string | null;
  location: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_verified: boolean;
  is_active: boolean;
  rating: number | null;
  active_internships_count?: number;
  interns_placed_count?: number;
}

const CompanyManagement = () => {
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [viewCompany, setViewCompany] = useState<any | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    industry: "",
    website: "",
    location: "",
    contact_person: "",
    contact_email: "",
    contact_phone: "",
    gst_number: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchCompanies = () => {
    setLoading(true);
    let url = `/ops/companies?page=1&page_size=50`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    api.get<any>(url)
      .then((res) => {
        setCompanies(res.items || []);
        setTotal(res.total || 0);
        setLoading(false);
      })
      .catch(() => {
        setCompanies([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCompanies();
  }, [search]);

  const handleCreateCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return alert("Company name is required");
    setSaving(true);
    api.post("/ops/companies", formData)
      .then(() => {
        setSaving(false);
        setShowForm(false);
        setFormData({
          name: "",
          industry: "",
          website: "",
          location: "",
          contact_person: "",
          contact_email: "",
          contact_phone: "",
          gst_number: "",
        });
        fetchCompanies();
      })
      .catch((err) => {
        setSaving(false);
        alert(err.message || "Failed to register company");
      });
  };

  const handleToggleStatus = (id: number, currentActive: boolean) => {
    api.post(`/ops/companies/${id}/status?is_active=${!currentActive}`)
      .then(() => fetchCompanies())
      .catch((err) => alert(err.message || "Failed to update company status"));
  };

  const handleViewCompany = (id: number) => {
    api.get<any>(`/ops/companies/${id}`)
      .then((res) => setViewCompany(res))
      .catch((err) => alert(err.message || "Failed to load company details"));
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Company Management</h1>
          <p className="text-sm text-muted-foreground">{total} companies in database</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="bg-accent hover:bg-accent/90" onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Company
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search companies..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company Grid */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : companies.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground bg-white rounded-xl border">
          No companies found in database. Click "Add Company" to register one.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {companies.map((c) => (
            <Card key={c.id} className="hover-lift">
              <CardContent className="p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-cyan text-lg font-bold text-white shadow">
                      {c.name[0].toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">{c.name}</h3>
                      <p className="text-xs text-muted-foreground">{c.industry || "General Industry"}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${c.is_active ? STATUS_STYLE.active : STATUS_STYLE.inactive}`}>
                    {c.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-accent" />{c.contact_email || "N/A"}</div>
                  <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-accent" />{c.contact_phone || "N/A"}</div>
                  <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-accent" />{c.website || "N/A"}</div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <span className="text-sm font-bold">{c.rating || "N/A"}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{c.interns_placed_count || 0} interns</span>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => handleViewCompany(c.id)}>
                    <Eye className="mr-1 h-3.5 w-3.5" /> View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={`flex-1 h-8 text-xs ${c.is_active ? "text-rose-600" : "text-emerald-600"}`}
                    onClick={() => handleToggleStatus(c.id, c.is_active)}
                  >
                    {c.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Company Registration Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Register New Company</CardTitle>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateCompany} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Company Name *</label>
                    <Input
                      placeholder="e.g., Zoho Corporation"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Industry</label>
                    <Input
                      placeholder="e.g. Software, IT Services"
                      value={formData.industry}
                      onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Website</label>
                    <Input
                      placeholder="https://company.com"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Location</label>
                    <Input
                      placeholder="City, State"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Contact Person</label>
                    <Input
                      placeholder="Full name"
                      value={formData.contact_person}
                      onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Contact Email</label>
                    <Input
                      type="email"
                      placeholder="hr@company.com"
                      value={formData.contact_email}
                      onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Phone</label>
                    <Input
                      placeholder="+91-XXXXXXXXXX"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">GST Number</label>
                    <Input
                      placeholder="Optional GST"
                      value={formData.gst_number}
                      onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="submit" disabled={saving} className="bg-accent hover:bg-accent/90">
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Company
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* View Company Modal */}
      {viewCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex-row items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-cyan text-2xl font-bold text-white">
                  {viewCompany.name[0].toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold">{viewCompany.name}</h2>
                  <p className="text-sm text-muted-foreground">{viewCompany.industry || "General"} · {viewCompany.location || "N/A"}</p>
                </div>
              </div>
              <button onClick={() => setViewCompany(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-4 text-center">
                  <p className="text-xl font-bold text-accent">{viewCompany.interns_placed_count || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Interns</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4 text-center">
                  <p className="text-xl font-bold text-amber-500">{viewCompany.rating || "N/A"}</p>
                  <p className="text-xs text-muted-foreground">Rating</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4 text-center">
                  <p className="text-xl font-bold text-emerald-600">{viewCompany.is_active ? "Active" : "Inactive"}</p>
                  <p className="text-xs text-muted-foreground">Status</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <h4 className="font-semibold">Contact Information</h4>
                <p><span className="font-medium">Person:</span> {viewCompany.contact_person || "N/A"}</p>
                <p><span className="font-medium">Email:</span> {viewCompany.contact_email || "N/A"}</p>
                <p><span className="font-medium">Phone:</span> {viewCompany.contact_phone || "N/A"}</p>
                <p><span className="font-medium">Website:</span> {viewCompany.website || "N/A"}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CompanyManagement;
