import { describe, expect, it } from "vitest";
import { checkInSchema } from "@/lib/validators/time-entries";
import { distanceMeters, geofenceLimitMeters } from "@/lib/utils/geo";

const UUID = "3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f";

describe("check-in without GPS (evidence, not a gate)", () => {
  const base = { shift_id: UUID, kind: "check_in" };
  it("accepts a check-in with no coordinates", () => {
    expect(checkInSchema.safeParse(base).success).toBe(true);
    expect(
      checkInSchema.safeParse({ ...base, latitude: null, longitude: null, accuracy_m: null }).success,
    ).toBe(true);
  });
  it("rejects half a coordinate pair", () => {
    expect(checkInSchema.safeParse({ ...base, latitude: 48.1 }).success).toBe(false);
    expect(checkInSchema.safeParse({ ...base, longitude: 11.5 }).success).toBe(false);
  });
  it("rejects strings, NaN and out-of-range values", () => {
    expect(checkInSchema.safeParse({ ...base, latitude: "48", longitude: "11" }).success).toBe(false);
    expect(checkInSchema.safeParse({ ...base, latitude: NaN, longitude: 11 }).success).toBe(false);
    expect(checkInSchema.safeParse({ ...base, latitude: 48, longitude: 181 }).success).toBe(false);
    expect(checkInSchema.safeParse({ ...base, latitude: 48, longitude: 11, accuracy_m: -1 }).success).toBe(false);
  });
  it("confirm_far must be a boolean", () => {
    expect(checkInSchema.safeParse({ ...base, confirm_far: true }).success).toBe(true);
    expect(checkInSchema.safeParse({ ...base, confirm_far: "yes" }).success).toBe(false);
  });
});

describe("geofenceLimitMeters", () => {
  it("adds the fix accuracy to the property radius", () => {
    expect(geofenceLimitMeters(100, 40)).toBe(140);
  });
  it("caps the accuracy slack at 100 m", () => {
    expect(geofenceLimitMeters(100, 3000)).toBe(200);
  });
  it("falls back to 100 m for a missing or broken radius", () => {
    expect(geofenceLimitMeters(null, null)).toBe(100);
    expect(geofenceLimitMeters(0, undefined)).toBe(100);
    expect(geofenceLimitMeters(-5, NaN)).toBe(100);
  });
  it("an honest indoor fix 120 m off with ±60 m accuracy passes a 100 m fence", () => {
    const d = distanceMeters(48.137154, 11.576124, 48.137154 + 120 / 111_320, 11.576124);
    expect(d).toBeGreaterThan(115);
    expect(d).toBeLessThan(geofenceLimitMeters(100, 60));
  });
});
