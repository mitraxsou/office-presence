-- Align office points-per-visit-day with SPEC §19 (by name; UI still reads API only).
UPDATE "OfficeLocation" SET "pointsPerVisitDay" = 4
WHERE "status" = 'active'
  AND (
    "name" ILIKE '%Gurugram%Tower B%'
    OR "name" ILIKE '%Gurugram%Cyber City%'
    OR "name" ILIKE '%Pune%Kharadi%'
  );

UPDATE "OfficeLocation" SET "pointsPerVisitDay" = 1
WHERE "status" = 'active'
  AND (
    "name" ILIKE '%Kolkata%Plot Y14%'
    OR "name" ILIKE '%Bengaluru%Prestige%'
  );
