import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Globe, Sparkles, ExternalLink, Eye, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Contractor = Tables<"contractors">;

interface WebsiteBuilderTabProps {
  contractor: Contractor;
  onUpdate: (updated: Contractor) => void;
}

interface WebsiteCopy {
  hero_headline: string;
  hero_subheadline: string;
  about_title: string;
  about_text: string;
  services_title: string;
  services: { name: string; description: string }[];
  cta_headline: string;
  cta_text: string;
}

const WebsiteBuilderTab = ({ contractor, onUpdate }: WebsiteBuilderTabProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [subdomain, setSubdomain] = useState(contractor.subdomain || "");
  const [copy, setCopy] = useState<WebsiteCopy | null>(
    (contractor.website_copy as unknown as WebsiteCopy) || null
  );

  const siteUrl = subdomain ? `${window.location.origin}/site/${subdomain}` : "";

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 40);

  const handleGenerateCopy = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-website-copy", {
        body: {
          business_name: contractor.business_name,
          location: contractor.business_address,
          phone: contractor.phone,
        },
      });
      if (error) throw error;
      if (data?.copy) {
        setCopy(data.copy);
        toast.success("Website copy generated! Review and edit below.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate copy");
    }
    setIsGenerating(false);
  };

  const handleSaveDraft = async () => {
    if (!subdomain.trim()) {
      toast.error("Please set a subdomain first");
      return;
    }
    setIsSaving(true);
    const slug = generateSlug(subdomain);
    const { data, error } = await supabase
      .from("contractors")
      .update({
        subdomain: slug,
        website_copy: copy as any,
      })
      .eq("id", contractor.id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        toast.error("This subdomain is already taken. Try another.");
      } else {
        toast.error("Failed to save");
      }
    } else if (data) {
      setSubdomain(slug);
      toast.success("Draft saved");
      onUpdate(data);
    }
    setIsSaving(false);
  };

  const handlePublish = async () => {
    if (!copy) {
      toast.error("Generate website copy first");
      return;
    }
    if (!subdomain.trim()) {
      toast.error("Set a subdomain first");
      return;
    }
    setIsPublishing(true);
    const slug = generateSlug(subdomain);
    const { data, error } = await supabase
      .from("contractors")
      .update({
        subdomain: slug,
        website_copy: copy as any,
        website_published: true,
      })
      .eq("id", contractor.id)
      .select()
      .single();

    if (error) {
      toast.error("Failed to publish");
    } else if (data) {
      setSubdomain(slug);
      toast.success("Website published! 🎉");
      onUpdate(data);
    }
    setIsPublishing(false);
  };

  const handleUnpublish = async () => {
    const { data, error } = await supabase
      .from("contractors")
      .update({ website_published: false })
      .eq("id", contractor.id)
      .select()
      .single();

    if (!error && data) {
      toast.success("Website unpublished");
      onUpdate(data);
    }
  };

  const updateCopyField = (field: keyof WebsiteCopy, value: any) => {
    if (!copy) return;
    setCopy({ ...copy, [field]: value });
  };

  const updateService = (index: number, field: "name" | "description", value: string) => {
    if (!copy) return;
    const updated = [...copy.services];
    updated[index] = { ...updated[index], [field]: value };
    setCopy({ ...copy, services: updated });
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(siteUrl);
    toast.success("URL copied!");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <Globe className="w-5 h-5" /> Your Website
              </CardTitle>
              <CardDescription>Build a professional website in minutes</CardDescription>
            </div>
            <Badge variant={contractor.website_published ? "default" : "secondary"}>
              {contractor.website_published ? "Published" : "Draft"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Subdomain */}
          <div className="space-y-2">
            <Label>Website URL</Label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center">
                <span className="text-sm text-muted-foreground px-3 py-2 bg-muted rounded-l-lg border border-r-0 border-input">
                  {window.location.origin}/site/
                </span>
                <Input
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="your-business"
                  className="rounded-l-none"
                  maxLength={40}
                />
              </div>
              {siteUrl && (
                <Button variant="ghost" size="icon" onClick={copyUrl} title="Copy URL">
                  <Copy className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenerateCopy} disabled={isGenerating} variant="outline">
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              {copy ? "Regenerate Copy" : "Generate with AI"}
            </Button>
            {siteUrl && contractor.website_published && (
              <Button variant="outline" asChild>
                <a href={siteUrl} target="_blank" rel="noopener noreferrer">
                  <Eye className="w-4 h-4 mr-2" /> Preview
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Copy Editor */}
      {copy && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Edit Content</CardTitle>
            <CardDescription>Customize your website copy below</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Hero */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Hero Section</h4>
              <div className="space-y-2">
                <Label>Headline</Label>
                <Input value={copy.hero_headline} onChange={(e) => updateCopyField("hero_headline", e.target.value)} maxLength={60} />
              </div>
              <div className="space-y-2">
                <Label>Subheadline</Label>
                <Input value={copy.hero_subheadline} onChange={(e) => updateCopyField("hero_subheadline", e.target.value)} maxLength={100} />
              </div>
            </div>

            <Separator />

            {/* About */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">About Section</h4>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={copy.about_title} onChange={(e) => updateCopyField("about_title", e.target.value)} maxLength={40} />
              </div>
              <div className="space-y-2">
                <Label>Text</Label>
                <Textarea value={copy.about_text} onChange={(e) => updateCopyField("about_text", e.target.value)} rows={3} maxLength={500} />
              </div>
            </div>

            <Separator />

            {/* Services */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Services</h4>
              <div className="space-y-2">
                <Label>Section Title</Label>
                <Input value={copy.services_title} onChange={(e) => updateCopyField("services_title", e.target.value)} maxLength={40} />
              </div>
              {copy.services.map((svc, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <Input value={svc.name} onChange={(e) => updateService(i, "name", e.target.value)} placeholder="Service name" maxLength={40} />
                  <Input value={svc.description} onChange={(e) => updateService(i, "description", e.target.value)} placeholder="Description" className="col-span-2" maxLength={100} />
                </div>
              ))}
            </div>

            <Separator />

            {/* CTA */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Call to Action</h4>
              <div className="space-y-2">
                <Label>Headline</Label>
                <Input value={copy.cta_headline} onChange={(e) => updateCopyField("cta_headline", e.target.value)} maxLength={40} />
              </div>
              <div className="space-y-2">
                <Label>Text</Label>
                <Input value={copy.cta_text} onChange={(e) => updateCopyField("cta_text", e.target.value)} maxLength={100} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Publish Actions */}
      {copy && (
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleSaveDraft} disabled={isSaving} variant="outline">
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Draft
          </Button>
          {contractor.website_published ? (
            <>
              <Button onClick={handlePublish} disabled={isPublishing}>
                {isPublishing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Update & Publish
              </Button>
              <Button variant="destructive" onClick={handleUnpublish}>Unpublish</Button>
            </>
          ) : (
            <Button onClick={handlePublish} disabled={isPublishing}>
              {isPublishing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
              Publish Website
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default WebsiteBuilderTab;
