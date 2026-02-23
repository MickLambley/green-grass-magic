import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface DaySchedule {
  enabled: boolean;
  start: string;
  end: string;
}

export interface WorkingHours {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

const DAYS: { key: keyof WorkingHours; label: string }[] = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

// Generate time options in 30-min increments from 05:00 to 21:00
const TIME_OPTIONS: string[] = [];
for (let h = 5; h <= 21; h++) {
  TIME_OPTIONS.push(`${h.toString().padStart(2, "0")}:00`);
  if (h < 21) TIME_OPTIONS.push(`${h.toString().padStart(2, "0")}:30`);
}

const formatTime = (t: string) => {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
};

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  monday: { enabled: true, start: "07:00", end: "17:00" },
  tuesday: { enabled: true, start: "07:00", end: "17:00" },
  wednesday: { enabled: true, start: "07:00", end: "17:00" },
  thursday: { enabled: true, start: "07:00", end: "17:00" },
  friday: { enabled: true, start: "07:00", end: "17:00" },
  saturday: { enabled: false, start: "08:00", end: "14:00" },
  sunday: { enabled: false, start: "08:00", end: "14:00" },
};

interface WorkingHoursEditorProps {
  value: WorkingHours;
  onChange: (value: WorkingHours) => void;
  compact?: boolean;
}

const WorkingHoursEditor = ({ value, onChange, compact = false }: WorkingHoursEditorProps) => {
  const updateDay = (day: keyof WorkingHours, field: keyof DaySchedule, val: string | boolean) => {
    onChange({
      ...value,
      [day]: { ...value[day], [field]: val },
    });
  };

  return (
    <div className="space-y-2">
      {DAYS.map(({ key, label }) => {
        const day = value[key];
        return (
          <div
            key={key}
            className={`flex items-center gap-3 rounded-lg border border-border p-2.5 transition-colors ${
              day.enabled ? "bg-card" : "bg-muted/40 opacity-70"
            }`}
          >
            <Switch
              checked={day.enabled}
              onCheckedChange={(v) => updateDay(key, "enabled", v)}
              id={`wh-${key}`}
            />
            <Label htmlFor={`wh-${key}`} className={`w-10 font-medium text-sm cursor-pointer ${compact ? "w-8" : ""}`}>
              {label}
            </Label>

            {day.enabled ? (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <Select value={day.start} onValueChange={(v) => updateDay(key, "start", v)}>
                  <SelectTrigger className="h-8 text-xs flex-1 min-w-[90px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t} className="text-xs">
                        {formatTime(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">to</span>
                <Select value={day.end} onValueChange={(v) => updateDay(key, "end", v)}>
                  <SelectTrigger className="h-8 text-xs flex-1 min-w-[90px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.filter((t) => t > day.start).map((t) => (
                      <SelectItem key={t} value={t} className="text-xs">
                        {formatTime(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Day off</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default WorkingHoursEditor;
