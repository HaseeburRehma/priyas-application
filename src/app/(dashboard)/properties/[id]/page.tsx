import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPropertyDetail } from "@/lib/api/properties";
import { loadDamageReportsForProperty } from "@/lib/api/damage";
import { loadClosuresForProperty } from "@/lib/api/property-closures";
import { can, getCurrentRole, requireRoute } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PropertyDetail } from "@/components/properties/PropertyDetail";
import { PropertyPhotosCard } from "@/components/properties/PropertyPhotosCard";
import { DamageReportsCard } from "@/components/properties/DamageReportsCard";
import { ClosuresCard } from "@/components/properties/ClosuresCard";
import { CleaningConceptCard } from "@/components/properties/CleaningConceptCard";

export const metadata: Metadata = { title: "Objektdetails" };
export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function Page({
  params,
}: {
  params: Promise<Params>;
}) {
  await requireRoute("property");
  const { id } = await params;
  const detail = await loadPropertyDetail(id);
  if (!detail) notFound();

  const [canUpdate, canDelete, canDamageCreate, canDamageResolve] =
    await Promise.all([
      can("property.update"),
      can("property.delete"),
      can("damage.create"),
      can("damage.resolve"),
    ]);

  // Photos with signed URLs (private bucket).
  const supabase = await createSupabaseServerClient();
  const { orgId } = await getCurrentRole();
  const { data: photoRows } = await supabase
    .from("property_photos")
    .select("id, storage_path, caption, created_at")
    .eq("property_id", id)
    .order("created_at", { ascending: false })
    .limit(40);

  type PhotoRow = {
    id: string;
    storage_path: string;
    caption: string | null;
    created_at: string;
  };
  const photos: Array<{
    id: string;
    storage_path: string;
    caption: string | null;
    created_at: string;
    signedUrl: string | null;
  }> = [];
  for (const p of (photoRows ?? []) as PhotoRow[]) {
    const { data: signed } = await supabase.storage
      .from("property-photos")
      .createSignedUrl(p.storage_path, 60 * 30);
    photos.push({
      ...p,
      signedUrl: signed?.signedUrl ?? null,
    });
  }

  // Damage reports + signed URLs for any attached damage photos.
  const damageReports = await loadDamageReportsForProperty(id);
  const damageSignedUrls: Record<string, string | null> = {};
  const allDamagePaths = Array.from(
    new Set(damageReports.flatMap((r) => r.photo_paths)),
  );
  for (const p of allDamagePaths) {
    const { data: signed } = await supabase.storage
      .from("property-photos")
      .createSignedUrl(p, 60 * 30);
    damageSignedUrls[p] = signed?.signedUrl ?? null;
  }

  // Closures
  const closures = await loadClosuresForProperty(id);

  // Signed URL for the cleaning concept PDF (if any).
  let cleaningConceptUrl: string | null = null;
  if (detail.cleaning_concept_path) {
    const { data: signed } = await supabase.storage
      .from("property-documents")
      .createSignedUrl(detail.cleaning_concept_path, 60 * 30);
    cleaningConceptUrl = signed?.signedUrl ?? null;
  }

  return (
    <>
      <PropertyDetail
        detail={detail}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
      <div className="mt-5">
        <CleaningConceptCard
          propertyId={detail.id}
          orgId={orgId ?? ""}
          cleaningConceptPath={detail.cleaning_concept_path}
          signedUrl={cleaningConceptUrl}
          canEdit={canUpdate}
        />
      </div>
      <div className="mt-5">
        <ClosuresCard
          propertyId={detail.id}
          closures={closures}
          canEdit={canUpdate}
        />
      </div>
      <div className="mt-5">
        <PropertyPhotosCard
          propertyId={detail.id}
          orgId={orgId ?? ""}
          initialPhotos={photos}
          canEdit={canUpdate}
          canDelete={canDelete}
        />
      </div>
      <div className="mt-5">
        <DamageReportsCard
          propertyId={detail.id}
          orgId={orgId ?? ""}
          reports={damageReports}
          signedUrlsByPath={damageSignedUrls}
          canCreate={canDamageCreate}
          canResolve={canDamageResolve}
        />
      </div>
    </>
  );
}
