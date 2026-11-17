-- AlterTable
ALTER TABLE "PresenceEvent" ADD COLUMN     "pointsAtMatch" INTEGER;

-- Freeze history at today's office weights.

-- Events that already carry an office id.
UPDATE "PresenceEvent" e
SET "pointsAtMatch" = o."pointsPerVisitDay"
FROM "OfficeLocation" o
WHERE e."officeLocationId" = o."id"
  AND e."pointsAtMatch" IS NULL;

-- Events with coordinates and no office id: nearest active office whose fence holds the fix,
-- with accuracy within the policy fence radius (same rule as matchNearestOffice).
UPDATE "PresenceEvent" e
SET "pointsAtMatch" = m."pointsPerVisitDay"
FROM (
  SELECT DISTINCT ON (ev."id") ev."id", o."pointsPerVisitDay"
  FROM "PresenceEvent" ev
  JOIN "OfficeLocation" o ON o."status" = 'active'
  CROSS JOIN (
    SELECT COALESCE((SELECT "fenceRadiusMeters" FROM "Policy" WHERE "id" = 1), 100) AS r
  ) p
  WHERE ev."officeLocationId" IS NULL
    AND ev."pointsAtMatch" IS NULL
    AND ev."latitude" IS NOT NULL
    AND ev."longitude" IS NOT NULL
    AND ev."accuracyMeters" IS NOT NULL
    AND ev."accuracyMeters" <= p.r
    AND 2 * 6371000 * asin(sqrt(
          power(sin(radians(o."latitude" - ev."latitude") / 2), 2) +
          cos(radians(ev."latitude")) * cos(radians(o."latitude")) *
          power(sin(radians(o."longitude" - ev."longitude") / 2), 2)
        )) <= o."radiusMeters"
  ORDER BY ev."id",
    2 * 6371000 * asin(sqrt(
      power(sin(radians(o."latitude" - ev."latitude") / 2), 2) +
      cos(radians(ev."latitude")) * cos(radians(o."latitude")) *
      power(sin(radians(o."longitude" - ev."longitude") / 2), 2)
    ))
) m
WHERE e."id" = m."id";

-- Admin, correction and Office Tracker visits: a positive award becomes the office weight
-- people see today. 0 stays 0 (day turned off).
UPDATE "Visit" v
SET "pointsAwarded" = o."pointsPerVisitDay"
FROM "OfficeLocation" o
WHERE v."officeLocationId" = o."id"
  AND v."source" IN ('admin', 'correction')
  AND v."pointsAwarded" > 0;
