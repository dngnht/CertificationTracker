"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createCertification, updateCertification } from "@/features/certifications/actions";

interface CertificationFormProps {
  certification?: {
    id: string;
    code: string;
    name: string;
    provider: string;
    description: string | null;
    validityMonths: number | null;
    goldReward: number;
    isRecommendedFeatured: boolean;
    recommendedNote: string | null;
  };
  trigger?: React.ReactNode;
}

export function CertificationForm({ certification, trigger }: CertificationFormProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [featured, setFeatured] = useState(certification?.isRecommendedFeatured ?? false);
  const isEdit = Boolean(certification);

  async function handleSubmit(formData: FormData) {
    setBusy(true);
    const payload = {
      code: formData.get("code") as string,
      name: formData.get("name") as string,
      provider: formData.get("provider") as string,
      description: (formData.get("description") as string) || null,
      validityMonths: formData.get("validityMonths")
        ? Number(formData.get("validityMonths"))
        : null,
      goldReward: formData.get("goldReward") ? Number(formData.get("goldReward")) : 0,
      isRecommendedFeatured: featured,
      recommendedNote: (formData.get("recommendedNote") as string) || null,
    };

    const result = isEdit
      ? await updateCertification({ ...payload, id: certification!.id })
      : await createCertification(payload);

    setBusy(false);
    if (result.ok) {
      toast.success(isEdit ? "Certification updated" : "Certification created");
      setOpen(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button>{isEdit ? "Edit" : "New Certification"}</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Certification" : "New Certification"}</DialogTitle>
          <DialogDescription>
            Define what the certification is (code, name, provider).
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input id="code" name="code" defaultValue={certification?.code} placeholder="AZ-204" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Input id="provider" name="provider" defaultValue={certification?.provider} placeholder="Microsoft" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={certification?.name} placeholder="Azure Developer Associate" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" defaultValue={certification?.description ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="validityMonths">Validity (months)</Label>
            <Input
              id="validityMonths"
              name="validityMonths"
              type="number"
              min={1}
              defaultValue={certification?.validityMonths ?? ""}
              placeholder="e.g. 24"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="goldReward">Gold Reward</Label>
              <Input
                id="goldReward"
                name="goldReward"
                type="number"
                min={0}
                defaultValue={certification?.goldReward ?? 0}
              />
            </div>
            <div className="flex items-end space-x-2 pb-2">
              <Checkbox id="featured" checked={featured} onCheckedChange={(v) => setFeatured(Boolean(v))} />
              <Label htmlFor="featured" className="font-normal">
                Feature as recommended
              </Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recommendedNote">Recommended note</Label>
            <Textarea
              id="recommendedNote"
              name="recommendedNote"
              defaultValue={certification?.recommendedNote ?? ""}
              placeholder="Why the company recommends this certification"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}