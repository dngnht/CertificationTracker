"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Power, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CertificationForm } from "./certification-form";
import {
  disableCertification,
  enableCertification,
} from "@/features/certifications/actions";

interface Certification {
  id: string;
  code: string;
  name: string;
  provider: string;
  description: string | null;
  validityMonths: number | null;
  isActive: boolean;
  goldReward: number;
  isRecommendedFeatured: boolean;
  recommendedNote: string | null;
}

export function CertificationTable({ certifications }: { certifications: Certification[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(c: Certification) {
    setBusyId(c.id);
    const result = c.isActive ? await disableCertification(c.id) : await enableCertification(c.id);
    setBusyId(null);
    if (result.ok) toast.success(c.isActive ? "Certification disabled" : "Certification enabled");
    else toast.error(result.error);
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Validity</TableHead>
            <TableHead>Gold</TableHead>
            <TableHead>Featured</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {certifications.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.code}</TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell>{c.provider}</TableCell>
              <TableCell>{c.validityMonths ? `${c.validityMonths} months` : "—"}</TableCell>
              <TableCell>
                {c.goldReward > 0 ? (
                  <Badge variant="warning">{c.goldReward}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {c.isRecommendedFeatured ? <Badge variant="success">Featured</Badge> : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                <Badge variant={c.isActive ? "success" : "muted"}>
                  {c.isActive ? "Active" : "Disabled"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <CertificationForm
                    certification={{
                      id: c.id,
                      code: c.code,
                      name: c.name,
                      provider: c.provider,
                      description: c.description,
                      validityMonths: c.validityMonths,
                      goldReward: c.goldReward,
                      isRecommendedFeatured: c.isRecommendedFeatured,
                      recommendedNote: c.recommendedNote,
                    }}
                    trigger={
                      <Button variant="ghost" size="icon" aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={c.isActive ? "Disable" : "Enable"}
                    onClick={() => toggle(c)}
                    disabled={busyId === c.id}
                  >
                    {c.isActive ? <Power className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}