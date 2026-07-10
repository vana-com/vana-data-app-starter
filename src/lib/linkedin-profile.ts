export type LinkedInWorkItem = {
  title: string;
  company: string;
  period: string;
};

export type LinkedInEducationItem = {
  school: string;
  degree: string;
  period: string;
};

export type LinkedInSnapshot = {
  name: string;
  headline: string;
  work: LinkedInWorkItem[];
  education: LinkedInEducationItem[];
  skills: string[];
};

type RecordValue = Record<string, unknown>;

export function mapLinkedInProfile(input: unknown): LinkedInSnapshot {
  const profile = unwrapProfile(input);
  if (!profile) return emptyLinkedInSnapshot();

  const name =
    firstString(profile, ["fullName", "full_name", "name"]) ||
    [firstString(profile, ["firstName", "first_name"]), firstString(profile, ["lastName", "last_name"])]
      .filter(Boolean)
      .join(" ");

  return {
    name: name || "LinkedIn profile",
    headline: firstString(profile, ["headline", "occupation"]),
    work: firstArray(profile, [
      "experience",
      "experiences",
      "positions",
      "workExperience",
      "work_experience",
    ])
      .map(mapWorkItem)
      .filter((item): item is LinkedInWorkItem => item !== null),
    education: firstArray(profile, ["education", "educations", "schools"])
      .map(mapEducationItem)
      .filter((item): item is LinkedInEducationItem => item !== null),
    skills: firstArray(profile, ["skills", "topSkills", "top_skills"])
      .map(skillName)
      .filter((skill): skill is string => skill !== ""),
  };
}

export function emptyLinkedInSnapshot(): LinkedInSnapshot {
  return {
    name: "LinkedIn profile",
    headline: "",
    work: [],
    education: [],
    skills: [],
  };
}

function unwrapProfile(input: unknown, depth = 0): RecordValue | null {
  if (depth > 4) return null;
  if (Array.isArray(input)) return unwrapProfile(input[0], depth + 1);
  if (!isRecord(input)) return null;

  if (hasProfileFields(input)) return input;
  if ("linkedin.profile" in input) return unwrapProfile(input["linkedin.profile"], depth + 1);
  if ("data" in input) return unwrapProfile(input.data, depth + 1);
  if ("result" in input) return unwrapProfile(input.result, depth + 1);
  return null;
}

function hasProfileFields(value: RecordValue): boolean {
  return [
    "fullName",
    "full_name",
    "name",
    "firstName",
    "first_name",
    "headline",
    "occupation",
    "experience",
    "work_experience",
    "education",
    "skills",
  ].some((key) => key in value);
}

function mapWorkItem(input: unknown): LinkedInWorkItem | null {
  if (!isRecord(input)) return null;
  const title = firstString(input, ["title", "jobTitle", "job_title", "position", "role"]);
  const company = namedString(
    firstValue(input, ["companyName", "company_name", "company", "organization", "employer"]),
  );
  if (!title && !company) return null;

  return {
    title,
    company,
    period: periodString(input),
  };
}

function mapEducationItem(input: unknown): LinkedInEducationItem | null {
  if (!isRecord(input)) return null;
  const school = namedString(
    firstValue(input, ["schoolName", "school_name", "school", "institution", "university"]),
  );
  const degree = firstString(input, ["degree", "degreeName", "degree_name"]);
  if (!school && !degree) return null;

  return {
    school,
    degree,
    period: firstString(input, ["years", "dates", "dateRange", "date_range"]) || periodString(input),
  };
}

function periodString(input: RecordValue): string {
  const combined = firstString(input, ["dates", "period", "dateRange", "date_range"]);
  if (combined) return combined;

  const start = dateString(firstValue(input, ["startDate", "start_date", "startsAt", "starts_at", "start"]));
  const end = dateString(firstValue(input, ["endDate", "end_date", "endsAt", "ends_at", "end"]));
  const current = firstValue(input, ["isCurrent", "is_current", "current"]) === true;
  if (start && (end || current)) return `${start} - ${end || "Present"}`;
  return start || end;
}

function skillName(input: unknown): string {
  if (typeof input === "string") return clean(input);
  return isRecord(input) ? firstString(input, ["name", "skill", "title"]) : "";
}

function namedString(input: unknown): string {
  if (typeof input === "string") return clean(input);
  return isRecord(input) ? firstString(input, ["name", "title", "label"]) : "";
}

function dateString(input: unknown): string {
  if (typeof input === "string") return clean(input);
  if (typeof input === "number" && Number.isFinite(input)) return String(input);
  if (!isRecord(input)) return "";
  const year = input.year;
  const month = input.month;
  if (typeof year !== "number" || !Number.isFinite(year)) return "";
  if (typeof month === "number" && month >= 1 && month <= 12) {
    return `${year}-${String(month).padStart(2, "0")}`;
  }
  return String(year);
}

function firstArray(input: RecordValue, keys: string[]): unknown[] {
  for (const key of keys) {
    if (Array.isArray(input[key])) return input[key];
  }
  return [];
}

function firstString(input: RecordValue, keys: string[]): string {
  const value = firstValue(input, keys);
  return typeof value === "string" ? clean(value) : "";
}

function firstValue(input: RecordValue, keys: string[]): unknown {
  for (const key of keys) {
    if (input[key] !== undefined && input[key] !== null) return input[key];
  }
  return undefined;
}

function clean(value: string): string {
  return value.trim();
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
