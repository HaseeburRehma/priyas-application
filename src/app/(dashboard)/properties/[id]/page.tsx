import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPropertyDetail } from "@/lib/api/properties";
import { loadDamageReportsForProperty } from "@/lib/api/damage";
import { loadClosuresForProperty } from "@/lib/api/property-closures";
import { loadPropertyKeys } from "@/lib/api/property-keys";
import { can, getCurrentRole, requireRoute } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PropertyDetail } from "@/components/properties/PropertyDetail";
import { PropertyPhotosCard } from "@/components/properties/PropertyPhotosCard";
import { DamageReportsCard } from "@/components/properties/DamageReportsCard";
import { ClosuresCard } from "@/components/properties/ClosuresCard";
import { CleaningConceptCard } from "@/components/properties/CleaningConceptCard";
import { PropertyKeysCard } from "@/components/properties/PropertyKeysCard";

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

  // ---- Independent server fetches, parallelised ---------------------------
  // `createSupabaseServerClient` and the rest of the loaders below don't
  // depend on each other. Awaiting them serially caused the property page
  // to waterfall through 5+ round-trips (~600-900ms in dev). With
  // Promise.all the tail latency drops to the slowest individual query.
  const [supabase, { orgId }, damageReports, closures, keys] = await Promise.all([
    createSupabaseServerClient(),
    getCurrentRole(),
    loadDamageReportsForProperty(id),
    loadClosuresForProperty(id),
    loadPropertyKeys(id),
  ]);

  // ---- Fetches that depend on `supabase` (the client handle) --------------
  type PhotoRow = {
    id: string;
    storage_path: string;
    caption: string | null;
    created_at: string;
  };
  const [{ data: photoRows }, { data: empRows }] = await Promise.all([
    supabase
      .from("property_photos")
      .select("id, storage_path, caption, created_at")
      .eq("property_id", id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("employees")
      .select("id, full_name")
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
  ]);
  const keyEmployees = (empRows ?? []) as Array<{ id: string; full_name: string }>;

  // Signed URLs for every photo path in parallel (one round-trip per path).
  const photoRowList = (photoRows ?? []) as PhotoRow[];
  const photos: Array<{
    id: string;
    storage_path: string;
    caption: string | null;
    created_at: string;
    signedUrl: string | null;
  }> = await Promise.all(
    photoRowList.map(async (p) => {
      const { data: signed } = await supabase.storage
        .from("property-photos")
        .createSignedUrl(p.storage_path, 60 * 30);
      return { ...p, signedUrl: signed?.signedUrl ?? null };
    }),
  );

  // Damage photos: same idea — parallel signed-URL requests on the unique
  // path set, then assembled into the lookup map.
  const allDamagePaths = Array.from(
    new Set(damageReports.flatMap((r) => r.photo_paths)),
  );
  const damageEntries = await Promise.all(
    allDamagePaths.map(async (p) => {
      const { data: signed } = await supabase.storage
        .from("property-photos")
        .createSignedUrl(p, 60 * 30);
      return [p, signed?.signedUrl ?? null] as const;
    }),
  );
  const damageSignedUrls: Record<string, string | null> = Object.fromEntries(
    damageEntries,
  );

  // Cleaning concept PDF — independent again.
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
      <div className="mt-5">
        <PropertyKeysCard
          propertyId={detail.id}
          keys={keys}
          employees={keyEmployees}
          canEdit={canUpdate}
          canDelete={canDelete}
        />
      </div>
    </>
  );
}
