
-- Add working_hours JSONB column to contractors with default Mon-Fri 7am-5pm
ALTER TABLE public.contractors
ADD COLUMN working_hours jsonb NOT NULL DEFAULT '{
  "monday":    {"enabled": true,  "start": "07:00", "end": "17:00"},
  "tuesday":   {"enabled": true,  "start": "07:00", "end": "17:00"},
  "wednesday": {"enabled": true,  "start": "07:00", "end": "17:00"},
  "thursday":  {"enabled": true,  "start": "07:00", "end": "17:00"},
  "friday":    {"enabled": true,  "start": "07:00", "end": "17:00"},
  "saturday":  {"enabled": false, "start": "08:00", "end": "14:00"},
  "sunday":    {"enabled": false, "start": "08:00", "end": "14:00"}
}'::jsonb;
