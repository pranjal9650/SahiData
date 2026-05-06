import React, { useState, useEffect, useRef } from "react";
import { fileStore } from "./utils/fileStore";
import { useSearchParams } from "react-router-dom";
import {
  FileSpreadsheet, Plus, Trash2, ChevronDown, CheckCircle2,
  Hash, Type, List, Calendar, Clock, Fingerprint, Zap, DollarSign,
  ToggleLeft, User, Info, LayoutDashboard, X, MapPin, Brain,
  AlertTriangle, CheckCheck, GripVertical, ArrowUp, ArrowDown,
  Mail, Phone, Sparkles, ChevronRight,
} from "lucide-react";

/* ─── Design tokens ─────────────────────────────────────────── */
const T = {
  red:      "#CC0000",
  redDark:  "#A30000",
  black:    "#111111",
  grey200:  "#E4E4E7",
  grey100:  "#F4F4F5",
  white:    "#FFFFFF",
  green:    "#059669",
  greenBg:  "rgba(5,150,105,0.08)",
  redBg:    "rgba(204,0,0,0.07)",
  blueBg:   "rgba(37,99,235,0.07)",
  blue:     "#2563EB",
  text:     "#111111",
  muted:    "#71717A",
  orange:   "#D97706",
  orangeBg: "rgba(217,119,6,0.08)",
  overlay:  "rgba(0,0,0,0.45)",
  purple:   "#7C3AED",
  purpleBg: "rgba(124,58,237,0.07)",
  teal:     "#0891B2",
  tealBg:   "rgba(8,145,178,0.07)",
};

/* ─────────────────────────────────────────────────────────────
   TEXT SUB-TYPES
───────────────────────────────────────────────────────────── */
const TEXT_SUBTYPES = [
  {
    value: "person_name",
    label: "Person Name",
    icon: "👤",
    desc: "Full names like Ramesh Kumar, Yogesh Naykodi",
    example: "e.g. Ramesh Kumar",
    autoForbid: ["designations", "honorifics", "abbreviations", "numeric_only", "single_char", "placeholder_text"],
  },
  {
    value: "site_name",
    label: "Site / Place Name",
    icon: "📍",
    desc: "Location names like Kalibari Road, Mumbai Substation",
    example: "e.g. Kalibari Road, Pune East Depot",
    autoForbid: ["abbreviations", "numeric_only", "single_char", "placeholder_text"],
  },
  {
    value: "remarks",
    label: "Remarks / Free Text",
    icon: "💬",
    desc: "Open-ended notes, comments, admin remarks",
    example: "e.g. Meter replaced due to damage",
    autoForbid: ["numeric_only", "single_char", "placeholder_text"],
  },
  {
    value: "address",
    label: "Address",
    icon: "🏠",
    desc: "Street address, locality, area",
    example: "e.g. 12, Gandhi Nagar, Bhopal",
    autoForbid: ["numeric_only", "single_char", "placeholder_text"],
  },
  {
    value: "city",
    label: "City / District",
    icon: "🏙️",
    desc: "City, district or town names (validated against known Indian cities)",
    example: "e.g. Mumbai, Delhi, Pune",
    autoForbid: ["numeric_only", "single_char", "placeholder_text"],
  },
  {
    value: "state",
    label: "State / UT",
    icon: "🗺️",
    desc: "Indian state or Union Territory name",
    example: "e.g. Maharashtra, Delhi, Karnataka",
    autoForbid: ["numeric_only", "single_char", "placeholder_text"],
  },
  {
    value: "custom",
    label: "Custom (manual config)",
    icon: "⚙️",
    desc: "Configure rejection rules manually below",
    example: "",
    autoForbid: [],
  },
];

/* ─────────────────────────────────────────────────────────────
   LOCAL RULE-BASED CLASSIFIER
───────────────────────────────────────────────────────────── */
const KNOWN_DESIGNATIONS = new Set([
  "sarpanch","pradhan","sachiv","chairman","president","vice president","secretary",
  "manager","engineer","clerk","officer","inspector","supervisor","head","director",
  "collector","tehsildar","patwari","lekhpal","accountant","assistant","helper",
  "operator","technician","lineman","junior engineer","executive engineer","se",
  "ae","je","xen","sdo","sub divisional officer","divisional officer","do",
  "dr","doctor","professor","principal","teacher","advocate","lawyer","ca",
  "ias","ips","ifs","pcs","psc","mla","mp","councillor","ward member",
  "gram panchayat","block pramukh","zila panchayat","district magistrate","dm",
  "ceo","cto","cfo","vp","gm","agm","dgm","rm","am","bm",
]);

const KNOWN_HONORIFICS = new Set([
  "mr","mrs","ms","miss","dr","prof","shri","smt","kumari","km",
  "sri","sh","km.","smt.","shri.","dr.","mr.","mrs.","ms.","prof.",
]);

const KNOWN_ABBREVIATIONS = new Set([
  "na","n/a","nil","null","none","not applicable","tbd","tba","wip",
  "n.a.","n/a","n.a","---","--","-",".", "..", "...",
]);

const PLACEHOLDER_PATTERNS = [
  /^(test|dummy|sample|temp|xxx|yyy|zzz|abc|xyz|foo|bar|baz|asdf|qwerty)$/i,
  /^(aaa+|bbb+|ccc+|111+|000+)$/i,
];

function classifyLocally({ value, forbidden, blocklist, minLen, maxLen, textSubtype, type, allowed_prefixes, pincode_format }) {
  const v = value.trim();
  const vLower = v.toLowerCase();

  // ── UNIVERSAL GARBAGE DETECTION ─────────────────────
  const GLOBAL_BLOCKLIST = new Set([
    "test","dummy","sample","temp","na","n/a","nil","null","none",
    "tatti","gobar","jhaat","chutiya","gaand","lund","gandu","randi",
    "saala","madarchod","bhenchod","bhosdike","asdf","qwerty","zxcv",
    "abcd","aaaa","bbbb","cccc","xxxx","yyyy","zzzz","1234","0000",
    "00000","000000","1111","9999","99999","999999","123456","654321",
    "aaaaaa","bbbbbb","xxxxxx",
  ]);

  const vGlobalLower = v.toLowerCase().trim();

  if (GLOBAL_BLOCKLIST.has(vGlobalLower)) {
    return { valid: false, category: "garbage",
      reason: `"${v}" is not a valid value — looks like test/garbage data.` };
  }

  if (v.length > 3 && new Set(v.toLowerCase().split("")).size === 1) {
    return { valid: false, category: "garbage",
      reason: `"${v}" is not a valid value — repeated characters are not accepted.` };
  }

  const numericTypes = ["number","meter_reading","consumption","inr_rate",
    "inr_amount","latitude","longitude","latlong_text","latlong_json"];
  const isNumericType = numericTypes.includes(type || "");

  if (!isNumericType && /^[a-zA-Z]+$/.test(v) && v.length > 3) {
    const vowelCount = (v.match(/[aeiouAEIOU]/g) || []).length;
    const consonantCount = v.length - vowelCount;
    if (vowelCount === 0) {
      return { valid: false, category: "garbage",
        reason: `"${v}" contains no vowels — does not look like a real value.` };
    }
    if (consonantCount / vowelCount > 4 && v.length > 6) {
      return { valid: false, category: "garbage",
        reason: `"${v}" has an unusual letter pattern — does not look like a real value.` };
    }
  }

  if (isNumericType && v !== "0") {
    if (/^0+$/.test(v.replace(/[.,]/g, ""))) {
      return { valid: false, category: "garbage",
        reason: `"${v}" looks like a placeholder zero value — not a real number.` };
    }
    const digitsOnly = v.replace(/[^0-9]/g, "");
    if (digitsOnly.length > 4 && new Set(digitsOnly.split("")).size === 1) {
      return { valid: false, category: "garbage",
        reason: `"${v}" looks like a fake/placeholder number.` };
    }
  }
  // ── END UNIVERSAL GARBAGE DETECTION ──────────────────

  if (minLen && v.length < parseInt(minLen)) {
    return { valid: false, category: "too_short", reason: `Value is too short (min ${minLen} characters required).` };
  }
  if (maxLen && v.length > parseInt(maxLen)) {
    return { valid: false, category: "too_long", reason: `Value is too long (max ${maxLen} characters allowed).` };
  }

  if (blocklist) {
    const items = blocklist.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (items.includes(vLower)) {
      return { valid: false, category: "blocked", reason: `"${v}" is in the custom blocked values list.` };
    }
  }

  if (forbidden.includes("single_char") && v.length < 2) {
    return { valid: false, category: "single_char", reason: "Value is too short to be meaningful." };
  }

  if (forbidden.includes("numeric_only") && /^\d+$/.test(v)) {
    return { valid: false, category: "numeric", reason: `"${v}" is a pure number — expected a text value.` };
  }

  if (forbidden.includes("abbreviations") && KNOWN_ABBREVIATIONS.has(vLower)) {
    return { valid: false, category: "abbreviation", reason: `"${v}" appears to be an abbreviation or filler, not a real value.` };
  }

  if (forbidden.includes("honorifics")) {
    const stripped = vLower.replace(/[.\s]/g, "");
    if (KNOWN_HONORIFICS.has(stripped) || KNOWN_HONORIFICS.has(vLower)) {
      return { valid: false, category: "honorific", reason: `"${v}" is a title/honorific, not a full name.` };
    }
  }

  if (forbidden.includes("designations") && KNOWN_DESIGNATIONS.has(vLower)) {
    return { valid: false, category: "designation", reason: `"${v}" is a designation/role, not a valid name or identifier.` };
  }

  if (forbidden.includes("placeholder_text")) {
    for (const pat of PLACEHOLDER_PATTERNS) {
      if (pat.test(v)) {
        return { valid: false, category: "placeholder", reason: `"${v}" looks like placeholder/test data, not a real value.` };
      }
    }
  }

  if (textSubtype === "city") {
    const cityNorm = vLower.replace(/\s+/g, " ").trim();
    if (KNOWN_INDIAN_CITIES.has(cityNorm)) {
      return { valid: true, category: "valid", reason: `"${v}" is a recognised Indian city/district.` };
    }
    if (!/^[a-zA-Z\s\u0900-\u097F\-.]+$/.test(v) || v.length < 3) {
      return { valid: false, category: "invalid_city", reason: `"${v}" does not look like a valid city name — expected letters only, no numbers or special characters.` };
    }
    return { valid: false, category: "unknown_city", reason: `"${v}" was not found in the known city list. Check for spelling errors (e.g. "Pranjal" is a name, not a city).` };
  }

  if (textSubtype === "state") {
    const stateNorm = vLower.replace(/\s+/g, " ").trim();
    if (KNOWN_INDIAN_STATES.has(stateNorm)) {
      return { valid: true, category: "valid",
        reason: `"${v}" is a recognised Indian state/UT.` };
    }
    if (!/^[a-zA-Z\s\u0900-\u097F\-.&]+$/.test(v) || v.length < 2) {
      return { valid: false, category: "invalid_state",
        reason: `"${v}" does not look like a valid state name.` };
    }
    return { valid: false, category: "unknown_state",
      reason: `"${v}" was not found in the known Indian states list. Check spelling.` };
  }

  if (textSubtype === "address") {
    return validateAddressValue(v);
  }

  if (textSubtype === "site_name" && !/[a-zA-Z\u0900-\u097F]{2,}/.test(v)) {
    return { valid: false, category: "invalid_site", reason: "Site name should contain meaningful text, not just numbers or symbols." };
  }

  if (textSubtype === "person_name" && forbidden.includes("designations")) {
    if (/^[a-z]+$/.test(vLower) && vLower.length < 12) {
      const roleSuffixes = ["anch","man","head","chief","officer","ector","anager","ineer","clerk","ant"];
      for (const s of roleSuffixes) {
        if (vLower.endsWith(s)) {
          return { valid: false, category: "designation", reason: `"${v}" looks like a designation/role rather than a person's name.` };
        }
      }
    }
  }

  if (textSubtype === "person_name") {
    const INVALID_NAME_WORDS = new Set([
      "tatti", "gobar", "jhaat", "bhosdike", "madarchod", "bhenchod",
      "chutiya", "gaand", "lund", "rand", "randi", "saala", "gandu",
      "test", "dummy", "asdf", "qwerty", "zxcv", "abcd", "aaaa", "bbbb",
    ]);

    // 1. Blocked garbage words
    const words = v.split(/\s+/);
    for (const word of words) {
      if (INVALID_NAME_WORDS.has(word.toLowerCase())) {
        return { valid: false, category: "invalid_name", reason: `"${v}" is not a valid person name.` };
      }
    }

    // 2. No vowels check (after stripping spaces, hyphens, apostrophes)
    const strippedForVowels = v.replace(/[\s\-']/g, "");
    if (strippedForVowels.length > 1 && !/[aeiouAEIOU]/.test(strippedForVowels)) {
      return { valid: false, category: "invalid_name", reason: `"${v}" contains no vowels — does not look like a real name.` };
    }

    // 3. Consecutive consonants check (>4 in any single word)
    const VOWEL_SET = new Set(["a","e","i","o","u"]);
    for (const word of words) {
      let consCount = 0;
      for (const ch of word.toLowerCase()) {
        if (/[a-z]/.test(ch)) {
          if (!VOWEL_SET.has(ch)) {
            consCount++;
            if (consCount > 4) {
              return { valid: false, category: "invalid_name", reason: `"${v}" has an unusual letter pattern — does not look like a real name.` };
            }
          } else {
            consCount = 0;
          }
        } else {
          consCount = 0;
        }
      }
    }

    // 4. Digits check
    if (/\d/.test(v)) {
      return { valid: false, category: "invalid_name", reason: `Person names cannot contain numbers.` };
    }
  }

  if (type === "system_id" && allowed_prefixes) {
    const prefixes = allowed_prefixes
      .split(",")
      .map(p => p.trim().toLowerCase())
      .filter(Boolean);
    if (prefixes.length > 0) {
      const vLower = v.toLowerCase();
      const matchesAny = prefixes.some(p => vLower.startsWith(p.toLowerCase()));
      if (!matchesAny) {
        return {
          valid: false,
          category: "invalid_prefix",
          reason: `"${v}" does not start with an allowed prefix (${prefixes.join(", ")}).`,
        };
      }
    }
  }

  if (textSubtype === "person_name") {

    const INVALID_NAME_WORDS = new Set([
      "tatti","gobar","jhaat","bhosdike","madarchod","bhenchod","chutiya",
      "gaand","lund","rand","randi","saala","gandu","test","dummy","asdf",
      "qwerty","zxcv","abcd","aaaa","bbbb","akjsn","xyz","abc"
    ]);

    const nameWords = v.split(/\s+/).filter(Boolean);

    // Check 1: any word in blocklist
    for (const word of nameWords) {
      if (INVALID_NAME_WORDS.has(word.toLowerCase())) {
        return { valid: false, category: "invalid_name",
          reason: `"${v}" is not a valid person name.` };
      }
    }

    // Check 2: no vowels in any word longer than 2 chars
    for (const word of nameWords) {
      const clean = word.replace(/[^a-zA-Z]/g, "");
      if (clean.length > 2 && !/[aeiouAEIOU]/.test(clean)) {
        return { valid: false, category: "invalid_name",
          reason: `"${v}" contains no vowels — does not look like a real name.` };
      }
    }

    // Check 3: more than 3 consecutive consonants in any word
    for (const word of nameWords) {
      const clean = word.replace(/[^a-zA-Z]/g, "");
      if (/[^aeiouAEIOU]{4,}/i.test(clean)) {
        return { valid: false, category: "invalid_name",
          reason: `"${v}" has an unusual letter pattern — does not look like a real name.` };
      }
    }

    // Check 4: consonant to vowel ratio > 3 for any word longer than 3 chars
    for (const word of nameWords) {
      const clean = word.replace(/[^a-zA-Z]/g, "");
      if (clean.length > 3) {
        const vowels = (clean.match(/[aeiouAEIOU]/g) || []).length;
        const consonants = clean.length - vowels;
        if (vowels === 0 || consonants / vowels > 3) {
          return { valid: false, category: "invalid_name",
            reason: `"${v}" does not look like a real person name.` };
        }
      }
    }

    // Check 5: digits in name
    if (/\d/.test(v)) {
      return { valid: false, category: "invalid_name",
        reason: `Person names cannot contain numbers.` };
    }
  }

  if (type === "pincode") {
    const fmt = pincode_format || "india_6";
    if (fmt === "india_6") {
      if (!/^\d{6}$/.test(v)) {
        return { valid: false, category: "invalid_pincode", reason: `"${v}" is not a valid Indian pincode — expected exactly 6 digits (e.g. 411001).` };
      }
      if (v[0] === "0") {
        return { valid: false, category: "invalid_pincode", reason: `"${v}" is not a valid Indian pincode — first digit cannot be 0.` };
      }
      return { valid: true, category: "valid", reason: `"${v}" is a valid 6-digit Indian pincode.` };
    }
    if (fmt === "us_zip") {
      if (!/^\d{5}(-\d{4})?$/.test(v)) {
        return { valid: false, category: "invalid_pincode", reason: `"${v}" is not a valid US ZIP code — expected 5 digits (e.g. 12345) or ZIP+4 format (e.g. 12345-6789).` };
      }
      return { valid: true, category: "valid", reason: `"${v}" is a valid US ZIP code.` };
    }
    // any_numeric: 4–10 digit numeric string
    if (!/^\d{4,10}$/.test(v)) {
      return { valid: false, category: "invalid_pincode", reason: `"${v}" is not a valid postal code — expected a numeric string between 4 and 10 digits.` };
    }
    return { valid: true, category: "valid", reason: `"${v}" is a valid numeric postal code.` };
  }

  return { valid: true, category: "valid", reason: `"${v}" looks like a valid value for this field.` };
}

/* ─────────────────────────────────────────────────────────────
   TEXT FORBIDDEN CATEGORIES
───────────────────────────────────────────────────────────── */
const TEXT_FORBIDDEN_CATEGORIES = [
  {
    key: "designations",
    label: "Designations / Roles",
    examples: "Sarpanch, Engineer, Manager, Clerk",
    desc: "Job titles, government roles, professional designations",
  },
  {
    key: "honorifics",
    label: "Honorifics / Titles",
    examples: "Dr., Mr., Mrs., Shri, Smt.",
    desc: "Prefixes and suffixes used before/after names",
  },
  {
    key: "abbreviations",
    label: "Abbreviations / Acronyms",
    examples: "N/A, TBD, NA, CEO, IAS",
    desc: "Short-form codes that are not actual values",
  },
  {
    key: "numeric_only",
    label: "Pure Numeric Strings",
    examples: "12345, 007, 9999",
    desc: "Values that are entirely digits with no text",
  },
  {
    key: "single_char",
    label: "Single Characters / Very Short",
    examples: "A, B, -, .",
    desc: "Strings with fewer than 2 meaningful characters",
  },
  {
    key: "placeholder_text",
    label: "Placeholder / Filler Text",
    examples: "test, dummy, xyz, abc, temp",
    desc: "Clearly non-real values entered as placeholders",
  },
];

const FORBIDDEN_CAT_MAP = {};
TEXT_FORBIDDEN_CATEGORIES.forEach((c) => { FORBIDDEN_CAT_MAP[c.key] = c; });

/* ─────────────────────────────────────────────────────────────
   FIELD TYPE DEFINITIONS  (+ Email & Phone added)
───────────────────────────────────────────────────────────── */
const FIELD_TYPES = [
  {
    group: "Identity & System Fields",
    types: [
      {
        value: "uuid",
        label: "UUID (Auto ID)",
        icon: Fingerprint,
        desc: "System-generated unique ID (e.g. 065da08a-743e-4deb-95e4-aad64e98417b)",
      },
      {
        value: "system_id",
        label: "System ID (Mixed ID)",
        icon: Hash,
        desc: "IDs like ST-MAH-OD-0023 or ST_MUM_HPSC_0114",
        subFields: [
          {
            key: "allowed_prefixes",
            label: "Allowed Prefixes (comma-separated, optional)",
            placeholder: "e.g. ST-, OD-, FTTH-, ST_MUM — leave blank to allow any ID format",
          },
        ],
      },
      {
        value: "username",
        label: "Username",
        icon: User,
        desc: "Operator / CreatedUser / ModifiedUser (e.g. yogesh_naykodi_st)",
      },
    ],
  },
  {
    group: "Contact Fields",
    types: [
      {
        value: "email",
        label: "Email Address",
        icon: Mail,
        desc: "Standard email format (e.g. user@example.com)",
        subFields: [
          {
            key: "allowed_domains",
            label: "Allowed Domains (comma-separated, optional)",
            placeholder: "e.g. gmail.com, company.in — leave blank to allow all",
          },
        ],
      },
      {
        value: "phone",
        label: "Phone Number",
        icon: Phone,
        desc: "Mobile / landline number (Indian or international)",
        subFields: [
          {
            key: "phone_format",
            label: "Format",
            type: "select",
            options: [
              { value: "india_10", label: "India — 10-digit mobile (e.g. 9876543210)" },
              { value: "india_with_code", label: "India with country code (+91XXXXXXXXXX)" },
              { value: "international", label: "International (any valid format)" },
              { value: "any", label: "Any numeric phone number" },
            ],
          },
        ],
      },
    ],
  },
  {
    group: "Text Fields",
    types: [
      {
        value: "text",
        label: "Text (Name / Remarks)",
        icon: Type,
        desc: "Free text like Name, Site Name, Remarks, Admin Remark",
      },
      {
        value: "pincode",
        label: "Pincode / ZIP",
        icon: MapPin,
        desc: "Indian 6-digit pincode (e.g. 411001) or international ZIP",
        subFields: [
          {
            key: "pincode_format",
            label: "Format",
            type: "select",
            options: [
              { value: "india_6", label: "India — 6-digit pincode (e.g. 411001)" },
              { value: "us_zip", label: "US ZIP code (5-digit or ZIP+4)" },
              { value: "any_numeric", label: "Any numeric postal code" },
            ],
          },
        ],
      },
    ],
  },
  {
    group: "Meter & Numeric Data",
    types: [
      {
        value: "meter_reading",
        label: "Meter Reading (Start / Closing)",
        icon: Zap,
        desc: "Non-negative integer (e.g. 0, 30524)",
        subFields: [
          { key: "min", label: "Min Reading", placeholder: "e.g. 0" },
          { key: "max", label: "Max Reading", placeholder: "e.g. 999999" },
          {
            key: "unit",
            label: "Unit (optional)",
            type: "select",
            options: [
              { value: "",    label: "No unit / Not applicable" },
              { value: "m",   label: "Metres (m)" },
              { value: "cm",  label: "Centimetres (cm)" },
              { value: "mm",  label: "Millimetres (mm)" },
              { value: "km",  label: "Kilometres (km)" },
              { value: "ft",  label: "Feet (ft)" },
              { value: "in",  label: "Inches (in)" },
              { value: "sqm", label: "Square Metres (sq.m)" },
              { value: "sqft",label: "Square Feet (sq.ft)" },
              { value: "sqkm",label: "Square Kilometres (sq.km)" },
              { value: "acre",label: "Acres" },
              { value: "hectare", label: "Hectares" },
              { value: "kg",  label: "Kilograms (kg)" },
              { value: "g",   label: "Grams (g)" },
              { value: "ton", label: "Tonnes" },
              { value: "lb",  label: "Pounds (lb)" },
              { value: "l",   label: "Litres (L)" },
              { value: "ml",  label: "Millilitres (mL)" },
              { value: "kl",  label: "Kilolitres (kL)" },
              { value: "kw",  label: "Kilowatts (kW)" },
              { value: "kwh", label: "Kilowatt-hours (kWh)" },
              { value: "mw",  label: "Megawatts (MW)" },
              { value: "v",   label: "Volts (V)" },
              { value: "a",   label: "Amperes (A)" },
              { value: "hz",  label: "Hertz (Hz)" },
              { value: "years", label: "Years" },
              { value: "months", label: "Months" },
              { value: "days",   label: "Days" },
              { value: "hours",  label: "Hours" },
              { value: "custom", label: "Custom (type below)" },
            ],
          },
          {
            key: "unit_custom",
            label: "Custom Unit (only if Custom selected above)",
            placeholder: "e.g. stories, floors, units, bags",
          },
        ],
      },
      {
        value: "consumption",
        label: "Total Consumption",
        icon: Hash,
        desc: "Auto-calculated or numeric (Closing - Start)",
      },
      {
        value: "number",
        label: "General Number",
        icon: Hash,
        desc: "Any numeric field (Id, counts, etc.)",
        subFields: [
          { key: "min", label: "Min Value", placeholder: "e.g. 0" },
          { key: "max", label: "Max Value", placeholder: "e.g. 100000" },
          {
            key: "unit",
            label: "Unit (optional)",
            type: "select",
            options: [
              { value: "",    label: "No unit / Not applicable" },
              { value: "m",   label: "Metres (m)" },
              { value: "cm",  label: "Centimetres (cm)" },
              { value: "mm",  label: "Millimetres (mm)" },
              { value: "km",  label: "Kilometres (km)" },
              { value: "ft",  label: "Feet (ft)" },
              { value: "in",  label: "Inches (in)" },
              { value: "sqm", label: "Square Metres (sq.m)" },
              { value: "sqft",label: "Square Feet (sq.ft)" },
              { value: "sqkm",label: "Square Kilometres (sq.km)" },
              { value: "acre",label: "Acres" },
              { value: "hectare", label: "Hectares" },
              { value: "kg",  label: "Kilograms (kg)" },
              { value: "g",   label: "Grams (g)" },
              { value: "ton", label: "Tonnes" },
              { value: "lb",  label: "Pounds (lb)" },
              { value: "l",   label: "Litres (L)" },
              { value: "ml",  label: "Millilitres (mL)" },
              { value: "kl",  label: "Kilolitres (kL)" },
              { value: "kw",  label: "Kilowatts (kW)" },
              { value: "kwh", label: "Kilowatt-hours (kWh)" },
              { value: "mw",  label: "Megawatts (MW)" },
              { value: "v",   label: "Volts (V)" },
              { value: "a",   label: "Amperes (A)" },
              { value: "hz",  label: "Hertz (Hz)" },
              { value: "years", label: "Years" },
              { value: "months", label: "Months" },
              { value: "days",   label: "Days" },
              { value: "hours",  label: "Hours" },
              { value: "custom", label: "Custom (type below)" },
            ],
          },
          {
            key: "unit_custom",
            label: "Custom Unit (only if Custom selected above)",
            placeholder: "e.g. stories, floors, units, bags",
          },
        ],
      },
    ],
  },
  {
    group: "Financial Fields",
    types: [
      {
        value: "inr_rate",
        label: "Per Unit Cost (₹)",
        icon: DollarSign,
        desc: "Cost per unit (e.g. 8 ₹)",
      },
      {
        value: "inr_amount",
        label: "Total Amount (₹)",
        icon: DollarSign,
        desc: "Final bill amount",
        subFields: [
          { key: "min", label: "Min Amount", placeholder: "e.g. 0" },
          { key: "max", label: "Max Amount", placeholder: "e.g. 100000" },
        ],
      },
    ],
  },
  {
    group: "Date & Time Fields",
    types: [
      {
        value: "datetime",
        label: "DateTime (Reading / Created)",
        icon: Clock,
        desc: "e.g. 03/04/2026 14:22:57 — separators (/ or - or .) are all accepted",
        subFields: [
          {
            key: "format",
            label: "Format",
            type: "select",
            options: [
              { value: "dd/mm/yyyy hh:mm:ss", label: "DD/MM/YYYY HH:MM:SS" },
              { value: "mm/dd/yyyy hh:mm:ss", label: "MM/DD/YYYY HH:MM:SS" },
              { value: "yyyy-mm-dd hh:mm:ss", label: "YYYY-MM-DD HH:MM:SS" },
            ],
          },
        ],
      },
      {
        value: "date",
        label: "Date Only (Reading Month)",
        icon: Calendar,
        desc: "Date without time — separators (/ - .) are all treated as equivalent",
        subFields: [
          {
            key: "format",
            label: "Format",
            type: "select",
            options: [
              { value: "dd/mm/yyyy", label: "DD/MM/YYYY" },
              { value: "mm-dd-yyyy", label: "MM-DD-YYYY" },
              { value: "yyyy-mm-dd", label: "YYYY/MM/DD" },
            ],
          },
        ],
      },
    ],
  },
  {
    group: "Location Fields",
    types: [
      {
        value: "latlong_json",
        label: "Lat/Long (JSON format)",
        icon: MapPin,
        desc: 'GeoJSON format e.g. {"coordinates": [73.856, 18.516]}',
      },
      {
        value: "latlong_text",
        label: "Lat/Long (Text format)",
        icon: MapPin,
        desc: "Plain text e.g. 18.516, 73.856 or 18.516 73.856",
      },
      {
        value: "latitude",
        label: "Latitude Only",
        icon: MapPin,
        desc: "Decimal value between -90 and 90",
      },
      {
        value: "longitude",
        label: "Longitude Only",
        icon: MapPin,
        desc: "Decimal value between -180 and 180",
      },
    ],
  },
  {
    group: "Approval & Status",
    types: [
      {
        value: "approval_flag",
        label: "Approved / Rejected",
        icon: ToggleLeft,
        desc: "Handles Approved column",
        subFields: [
          { key: "true_values",  label: "Approved Values", placeholder: "e.g. Yes, Approved, 1" },
          { key: "false_values", label: "Rejected Values",  placeholder: "e.g. No, Rejected, 0" },
        ],
      },
    ],
  },
  {
    group: "Dropdown / Fixed Values",
    types: [
      {
        value: "dropdown",
        label: "Fixed Options",
        icon: List,
        desc: "Circle, Technician Name, etc.",
        subFields: [
          {
            key: "options",
            label: "Options (comma-separated)",
            placeholder: "e.g. Circle1, Circle2, Circle3",
          },
        ],
      },
    ],
  },
];

/* ─── Flatten for lookup ─────────────────────────────────────── */
const FIELD_TYPE_MAP = {};
FIELD_TYPES.forEach((g) => g.types.forEach((t) => { FIELD_TYPE_MAP[t.value] = t; }));

/* ─────────────────────────────────────────────────────────────
   INTELLIGENT SUGGESTION ENGINE
   Pure rule-based classifier — keyword matching on column name.
   Returns { type, textSubtype, reason, confidence }
───────────────────────────────────────────────────────────── */
function getRuleBasedFieldType(colName) {
  const col = colName.toLowerCase().replace(/[_-]+/g, " ").trim();

  // 1. UUID
  if (/\b(uuid|uid|guid)\b/.test(col))
    return { type: "uuid", textSubtype: null, reason: "UUID auto-generated identifier", confidence: "high" };

  // 2. System ID — runs before text checks so "site id", "employee id", etc. resolve correctly
  if (/\b(site id|site_id|siteid|meter id|meter_id|device id|device_id|unit id|unit_id|consumer id|consumer_id|connection id|connection_no|ref id|ref_id|reference id|pole id|pole_no|feeder id|feeder_no|substation id|sub id|id|code|sr no|serial no|s\.?no|ref no|reference|account no|account_no|consumer no|sl no)\b/.test(col))
    return { type: "system_id", textSubtype: null, reason: "System/reference identifier field — mixed alphanumeric ID", confidence: "high" };

  // 3. Email
  if (/\b(email|e mail|mail address)\b/.test(col))
    return { type: "email", textSubtype: null, reason: "Email address field — validates standard email format", confidence: "high" };

  // 4. Phone / Mobile — extended to catch "owner number", "owner contact" etc. before number check
  if (/\b(phone|mobile|contact no|contact number|cell|tel|whatsapp|mob no|ph no|mo no|owner number|owner contact|owner mobile|owner phone|landlord number|landlord contact|contact|helpline|emergency contact|alternate number|alternate contact|alt no)\b/.test(col))
    return { type: "phone", textSubtype: null, reason: "Phone number field — 10-digit Indian mobile validation recommended", confidence: "high" };

  // 5. State / UT
  if (/\b(state|states|province|state name|ut|union territory)\b/.test(col) &&
      !/\b(id|no|code|num|number|ref)\b/.test(col))
    return { type: "text", textSubtype: "state", reason: "State/UT field — validates against all Indian states and UTs", confidence: "high" };

  // 6. City / Location / District
  if (/\b(city|cities|location|place|town|village|district|taluka|taluk|tehsil|mandal|ward|locality|zone|region|area)\b/.test(col))
    return { type: "text", textSubtype: "city", reason: "City/Location field — validates against known Indian cities & districts", confidence: "high" };

  // 7. Pincode / ZIP — checked before address so standalone pincode columns don't fall into address
  if (/\b(pincode|pin code|postal|zip|zip code)\b/.test(col))
    return { type: "pincode", textSubtype: null, reason: "Postal/ZIP code field", confidence: "high" };

  // 8. Address
  if (/\b(address|addr|street|locality|postal code)\b/.test(col))
    return { type: "text", textSubtype: "address", reason: "Address field — free text with street/area details", confidence: "high" };

  // 8. Measurement / physical dimensions
  if (/\b(height|width|length|depth|area|size|distance|weight|age|floor|floors|stories|storey|capacity|volume|units|count|quantity|qty|building height|floor area|total floor|plot area|carpet area|builtup|built up)\b/.test(col))
    return { type: "number", textSubtype: null, reason: "Numeric measurement field — expects a number", confidence: "high" };

  // 9. Rent / Financial amounts
  if (/\b(rent|offer rent|monthly rent|deposit|security deposit|price|cost|charge|charges|fee|fees|salary|income|revenue|budget|expense|expenses|payment|payable|total cost|total price|total charges)\b/.test(col))
    return { type: "inr_amount", textSubtype: null, reason: "Indian Rupee amount field — expects a ₹ value", confidence: "high" };

  // 10. Person name — excluded when column implies an ID/code or a site/place name
  if (/\b(name|person|employee|officer|owner|customer|client|beneficiary|farmer|holder|whom|meet|met|visited by|contact person|attendee|representative|rep|assigned to|handled by|reported to|approved by|checked by|verified by|inspected by|submitted by|created by|modified by|updated by)\b/.test(col) &&
      !/\b(id|no|code|num|number|ref|_id|_no)\b/.test(col) &&
      !/\b(site|substation|feeder|pole|station|plant|facility|place|location|office|dept|department|division|circle|section|area|zone)\b/.test(col))
    return { type: "text", textSubtype: "person_name", reason: "Person name field — alphabets only, no numbers or job titles", confidence: "high" };

  // 11. Remarks / Notes
  if (/\b(remark|note|comment|description|desc|observation|summary|detail|feedback|message|info)\b/.test(col))
    return { type: "text", textSubtype: "remarks", reason: "Free text remarks field — open-ended notes or comments", confidence: "high" };

  // 12. Site / Station name — excluded when column also implies an ID/code
  if (/\b(site|substation|feeder|pole|station|plant|facility|office|dept|department|division|circle|section)\b/.test(col) &&
      !/\b(id|no|code|num|number|ref|_id|_no)\b/.test(col))
    return { type: "text", textSubtype: "site_name", reason: "Site/location identifier — place or infrastructure name", confidence: "high" };

  // 13. Date / Time
  if (/\b(date|datetime|timestamp|created at|updated at|modified|reading date|dob|birth date|year month)\b/.test(col))
    return { type: "datetime", textSubtype: null, reason: "Date/time field — use DD/MM/YYYY or YYYY-MM-DD format", confidence: "high" };
  if (/\bdate\b/.test(col))
    return { type: "date", textSubtype: null, reason: "Date field", confidence: "high" };

  // 14. Meter reading
  if (/\b(meter reading|opening reading|closing reading|start reading|end reading|initial reading|final reading)\b/.test(col))
    return { type: "meter_reading", textSubtype: null, reason: "Meter reading field — non-negative integer expected", confidence: "high" };

  // 15. Consumption
  if (/\bconsumption\b/.test(col))
    return { type: "consumption", textSubtype: null, reason: "Consumption field — numeric (closing minus opening reading)", confidence: "high" };

  // 16. Amount / Rate
  if (/\b(amount|bill amount|total amount|net amount|gross amount)\b/.test(col))
    return { type: "inr_amount", textSubtype: null, reason: "Indian Rupee amount field", confidence: "high" };
  if (/\b(rate|per unit|unit rate|tariff)\b/.test(col))
    return { type: "inr_rate", textSubtype: null, reason: "Per-unit rate field (₹)", confidence: "high" };

  // 17. Lat / Long
  if (/\b(latitude|lat)\b/.test(col))
    return { type: "latitude", textSubtype: null, reason: "Latitude coordinate — decimal value between -90 and 90", confidence: "high" };
  if (/\b(longitude|long|lng|lon)\b/.test(col))
    return { type: "longitude", textSubtype: null, reason: "Longitude coordinate — decimal value between -180 and 180", confidence: "high" };
  if (/\b(latlong|lat long|latlng|coordinates|gps|geo)\b/.test(col))
    return { type: "latlong_text", textSubtype: null, reason: "GPS coordinates field", confidence: "high" };

  // 18. Approval / Status
  if (/\b(approved|approval|rejected|reject|status|flag|active|inactive|verified)\b/.test(col))
    return { type: "approval_flag", textSubtype: null, reason: "Approval/status field — Yes/No or Approved/Rejected values", confidence: "medium" };

  // 19. General number
  if (/\b(number|num|total|sum|value|reading|index|rank|score)\b/.test(col))
    return { type: "number", textSubtype: null, reason: "Numeric field — whole or decimal number", confidence: "medium" };

  // 20. Default fallback
  return { type: "text", textSubtype: "remarks", reason: "General text field — configure sub-type below for smarter validation", confidence: "low" };
}

const KNOWN_INDIAN_STATES = new Set([
  "andhra pradesh","arunachal pradesh","assam","bihar","chhattisgarh",
  "goa","gujarat","haryana","himachal pradesh","jharkhand","karnataka",
  "kerala","madhya pradesh","maharashtra","manipur","meghalaya","mizoram",
  "nagaland","odisha","punjab","rajasthan","sikkim","tamil nadu","telangana",
  "tripura","uttar pradesh","uttarakhand","west bengal",
  "andaman and nicobar islands","andaman & nicobar","chandigarh",
  "dadra and nagar haveli","dadra & nagar haveli and daman & diu",
  "daman and diu","delhi","jammu and kashmir","jammu & kashmir",
  "ladakh","lakshadweep","puducherry","pondicherry",
  "ap","mp","up","wb","hp","uk","j&k","tn","ka","mh","gj","rj","pb",
  "orissa","uttaranchal","tamilnadu",
  "new delhi","ncr","j and k",
]);

const KNOWN_INDIAN_CITIES = new Set([
  // Major metros & large cities
  "mumbai","delhi","new delhi","bangalore","bengaluru","chennai","kolkata","pune",
  "hyderabad","ahmedabad","surat","jaipur","lucknow","kanpur","nagpur","indore",
  "thane","bhopal","visakhapatnam","vizag","pimpri","patna","vadodara","ludhiana",
  "agra","nashik","faridabad","meerut","rajkot","varanasi","srinagar","aurangabad",
  "sambhajinagar","dhanbad","amritsar","allahabad","prayagraj","howrah","coimbatore",
  "jabalpur","gwalior","vijayawada","jodhpur","madurai","raipur","kota","guwahati",
  "chandigarh","solapur","hubli","dharwad","hubli-dharwad","bareilly","moradabad",
  "mysore","mysuru","gurgaon","gurugram","noida","aligarh","tiruchirappalli","trichy",
  "bhubaneswar","salem","warangal","thiruvananthapuram","trivandrum","bhiwandi",
  "saharanpur","gorakhpur","guntur","bikaner","amravati","jamshedpur","bhilai",
  "cuttack","firozabad","kochi","cochin","nellore","bhavnagar","dehradun","durgapur",
  "asansol","nanded","kolhapur","ajmer","siliguri","jhansi","ulhasnagar","jammu",
  "sangli","mangaluru","mangalore","erode","belgaum","belagavi","tirunelveli",
  "malegaon","gaya","jalgaon","udaipur","davanagere","kozhikode","calicut","akola",
  "kurnool","ranchi","bokaro","bellary","patiala","agartala","bhagalpur",
  "muzaffarnagar","latur","dhule","rohtak","korba","bhilwara","berhampur","brahmapur",
  "muzaffarpur","ahmednagar","mathura","kollam","avadi","rajahmundry","kadapa",
  "bilaspur","shahjahanpur","shimla","shimoga","shivamogga","tiruppur","tirupur",
  "jalandhar","nizamabad","parbhani","ichalkaranji","pondicherry","puducherry",
  "port blair","panaji","gangtok","itanagar","aizawl","imphal","shillong","kohima",
  "dispur","silvassa","daman","diu","kavaratti","navi mumbai","greater noida",
  "mira-bhayandar","ayodhya","faizabad",
  // States
  "maharashtra","gujarat","rajasthan","madhya pradesh","uttar pradesh","bihar",
  "west bengal","karnataka","tamil nadu","andhra pradesh","telangana","kerala",
  "punjab","haryana","odisha","jharkhand","chhattisgarh","uttarakhand","himachal pradesh",
  "jammu and kashmir","assam","tripura","meghalaya","manipur","nagaland","mizoram",
  "arunachal pradesh","sikkim","goa","delhi",
  // Districts & smaller cities (Maharashtra)
  "satara","baramati","shirdi","nandurbar","wardha","yavatmal","buldhana","osmanabad",
  "bid","beed","hingoli","jalna","raigad","alibag","ratnagiri","sindhudurg","gondiya",
  "gondia","bhandara","gadchiroli","chandrapur","washim",
  // Rajasthan districts
  "alwar","bharatpur","sikar","jhunjhunu","pali","barmer","jalore","sirohi",
  "rajsamand","chittorgarh","bundi","sawai madhopur","karauli","tonk","dausa",
  "dholpur","dungarpur","banswara","pratapgarh","ganganagar","sri ganganagar",
  "hanumangarh","churu","jhalawar","baran",
  // Gujarat districts
  "gandhinagar","anand","nadiad","mehsana","patan","surendranagar","jamnagar",
  "junagadh","amreli","bharuch","valsad","navsari","tapi","narmada","kheda",
  "panchmahal","dahod","mahisagar","aravalli","sabarkantha","banaskantha","kutch",
  "morbi","botad","gir somnath",
  // MP districts
  "ujjain","sagar","rewa","satna","katni","chhindwara","betul","hoshangabad",
  "narmadapuram","vidisha","raisen","sehore","dewas","shajapur","agar malwa",
  "mandsaur","neemuch","ratlam","jhabua","alirajpur","dhar","khargone","barwani",
  "khandwa","burhanpur","narsinghpur","seoni","balaghat","mandla","dindori",
  "umaria","shahdol","anuppur","sidhi","singrauli","panna","damoh","tikamgarh",
  "chhatarpur","shivpuri","guna","ashoknagar","datia","morena","bhind","sheopur",
  // Bihar
  "darbhanga","purnia","arrah","begusarai","katihar","munger","samastipur",
  "hajipur","chapra","sasaram","bettiah","motihari","siwan","sitamarhi","madhubani",
  "supaul","saharsa","khagaria","sheohar","gopalganj","lakhisarai","sheikhpura",
  "nawada","jamui","banka","kishanganj","araria","madhepura",
  // West Bengal
  "bardhaman","burdwan","malda","barasat","nadia","murshidabad","birbhum","bankura",
  "purulia","north 24 parganas","south 24 parganas","west midnapore","east midnapore",
  "hooghly","cooch behar","jalpaiguri","darjeeling","kalimpong","alipurduar",
  "jhargram","paschim bardhaman","purba bardhaman","north dinajpur","south dinajpur",
]);

function validateCityValue(value) {
  const norm = value.trim().toLowerCase();
  if (KNOWN_INDIAN_CITIES.has(norm)) return { valid: true, reason: "Valid city" };
  if (/^[a-zA-Z\s\u0900-\u097F\-.]+$/.test(value) && value.length >= 3)
    return { valid: false, reason: "Not found in known city list — verify spelling" };
  return { valid: false, reason: "Does not appear to be a valid city name" };
}

/* ─────────────────────────────────────────────────────────────
   ADDRESS VALIDATION
   Detects column names that represent address fields and validates
   that values are structured, multi-word address strings.
───────────────────────────────────────────────────────────── */
const ADDRESS_COLUMN_KEYWORDS = [
  "address", "addr", "full address", "site address", "location",
  "street", "locality", "pincode", "pin code", "postal",
];

function isAddressColumn(colName) {
  const col = colName.toLowerCase().replace(/[_-]+/g, " ").trim();
  return ADDRESS_COLUMN_KEYWORDS.some((kw) => col.includes(kw));
}

const ADDRESS_INDICATOR_WORDS = [
  "road", "rd", "street", "st", "lane", "ln", "avenue", "ave",
  "sector", "sec", "block", "blk", "phase", "plot", "flat", "floor",
  "nagar", "colony", "vihar", "enclave", "layout", "extension", "extn",
  "park", "garden", "marg", "chowk", "bazaar", "bazar", "gali", "gully",
  "mohalla", "pura", "pur", "gram", "village", "ward", "zone",
  "cross", "main", "circle", "bypass", "highway", "nh", "sh",
  "area", "locality", "society", "apartment", "complex", "residency",
  "house", "building", "bldg", "near", "opp", "behind", "next to",
];

function validateAddressValue(value) {
  const v = value.trim();

  // 1. Too short
  if (v.length < 10) {
    return { valid: false, category: "too_short",
      reason: `"${v}" is too short to be a valid address (minimum 10 characters).` };
  }

  // 2. Pure numeric
  if (/^\d+$/.test(v)) {
    return { valid: false, category: "numeric",
      reason: `"${v}" is a number — addresses must contain text.` };
  }

  // 3. No alphabetic characters at all
  if (!/[a-zA-Z\u0900-\u097F]/.test(v)) {
    return { valid: false, category: "no_alpha",
      reason: `"${v}" contains no letters — addresses must have alphabetic content.` };
  }

  // 4. Must be multi-word
  const rawWords = v.split(/[\s,\-/]+/).filter(w => w.length > 0);
  const words = rawWords.map(w => w.replace(/[^a-zA-Z0-9]/g, "")).filter(w => w.length > 0);
  const alpha_words = words.filter(w => /^[a-zA-Z]+$/.test(w) && w.length > 2);
  if (words.length < 2) {
    return { valid: false, category: "single_word",
      reason: `"${v}" is a single word — addresses must include multiple words.` };
  }

  // 5. Gibberish checks — run on every alphabetic word
  const VOWELS = /[aeiouAEIOU]/;

  for (const word of alpha_words) {
    // 5a. No vowels in a word longer than 2 chars
    if (word.length > 2 && !VOWELS.test(word)) {
      return { valid: false, category: "gibberish",
        reason: `"${v}" contains "${word}" which has no vowels — does not look like a real address.` };
    }

    // 5b. More than 3 consecutive consonants
    if (/[^aeiouAEIOU]{4,}/i.test(word)) {
      return { valid: false, category: "gibberish",
        reason: `"${v}" contains "${word}" which has an unusual letter pattern — not a real address.` };
    }

    // 5c. Consonant to vowel ratio check
    const vowelCount = (word.match(/[aeiouAEIOU]/g) || []).length;
    const consonantCount = word.length - vowelCount;
    if (vowelCount === 0 || consonantCount / vowelCount > 3) {
      return { valid: false, category: "gibberish",
        reason: `"${v}" contains "${word}" which looks like random characters — not a real address.` };
    }
  }

  // 6. Overall meaningful word ratio check
  let meaningfulCount = 0;
  for (const word of words) {
    const wLower = word.toLowerCase();
    const isIndicator = ADDRESS_INDICATOR_WORDS.includes(wLower);
    const isNumeric = /^\d+[a-zA-Z]?$/.test(word);
    const hasVowel = VOWELS.test(word);
    const noLongConsonantCluster = !/[^aeiouAEIOU]{5,}/i.test(word);
    const isMeaningful = isIndicator || isNumeric ||
      (word.length >= 2 && hasVowel && noLongConsonantCluster);
    if (isMeaningful) meaningfulCount++;
  }

  const ratio = meaningfulCount / words.length;
  if (words.length >= 2 && ratio < 0.5) {
    return { valid: false, category: "gibberish",
      reason: `"${v}" does not look like a real address — too many unrecognisable words.` };
  }

  // 7. Passed all checks
  return { valid: true, category: "valid",
    reason: `"${v}" looks like a valid address.` };
}

// Pure rule-based suggestion — always works, no external API required
function fetchAISuggestion(columnName) {
  return getRuleBasedFieldType(columnName);
}

function getDefaultUnit(colName) {
  const col = colName.toLowerCase();
  if (/\b(height|depth|length|width|distance|altitude|elevation)\b/.test(col))
    return "m";
  if (/\b(area|carpet area|builtup|plot area|floor area|super area)\b/.test(col))
    return "sqft";
  if (/\b(weight|mass)\b/.test(col))
    return "kg";
  if (/\b(volume|capacity|storage)\b/.test(col))
    return "l";
  if (/\b(age|years old|experience)\b/.test(col))
    return "years";
  if (/\b(floors|floor|storey|stories)\b/.test(col))
    return "custom";
  if (/\b(power|load|consumption|kwh|kw|mw)\b/.test(col))
    return "kwh";
  if (/\b(speed|velocity)\b/.test(col))
    return "km";
  return "";
}

/* ─────────────────────────────────────────────────────────────
   DATE VALIDATION — separator-flexible
   dd/mm/yyyy and dd-mm-yyyy and dd.mm.yyyy all match "dd/mm/yyyy"
───────────────────────────────────────────────────────────── */
/* ─── Format form name to Capital Case ──────────────────────── */
const formatFormName = (value) =>
  value
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");

/* ─────────────────────────────────────────────────────────────
   TEXT INTELLIGENCE CONFIG COMPONENT
───────────────────────────────────────────────────────────── */
function TextIntelligenceConfig({ col, rule, onChange }) {
  const [testValue, setTestValue]   = useState("");
  const [testResult, setTestResult] = useState(null);
  const debounceRef = useRef(null);

  const textSubtype = rule?.text_intelligence?.subtype || "";
  const forbidden   = rule?.text_intelligence?.forbidden_categories || [];
  const blocklist   = rule?.text_intelligence?.custom_blocklist || "";
  const minLen      = rule?.text_intelligence?.min_length || "";
  const maxLen      = rule?.text_intelligence?.max_length || "";

  // Filter subtypes based on column name
  const colLower = col?.toLowerCase() || "";
  const filteredSubtypes = TEXT_SUBTYPES.filter((st) => {
    if (colLower.includes("city")) return st.value === "site_name";
    if (colLower.includes("address") || colLower.includes("area")) return ["address", "site_name", "remarks"].includes(st.value);
    return true;
  });

  const setIntelligence = (key, value) => {
    const current = rule?.text_intelligence || {};
    onChange("text_intelligence", { ...current, [key]: value });
  };

  const handleSubtypeChange = (val) => {
    const subtypeDef = TEXT_SUBTYPES.find((s) => s.value === val);
    const current = rule?.text_intelligence || {};
    onChange("text_intelligence", {
      ...current,
      subtype: val,
      forbidden_categories: subtypeDef?.autoForbid || [],
    });
    setTestResult(null);
  };

  const toggleCategory = (key) => {
    const updated = forbidden.includes(key)
      ? forbidden.filter((k) => k !== key)
      : [...forbidden, key];
    setIntelligence("forbidden_categories", updated);
  };

  const runTest = (value) => {
    if (!value.trim()) { setTestResult(null); return; }

    // City validation for city columns
    if (colLower.includes("city")) {
      const cityResult = validateCityValue(value.trim());
      if (!cityResult.valid) {
        setTestResult(cityResult);
        return;
      }
    }

    // Address validation — triggered by subtype OR by column name containing address keywords
    if (textSubtype === "address" || isAddressColumn(col || "")) {
      const addrResult = validateAddressValue(value.trim());
      setTestResult(addrResult);
      return;
    }

    const result = classifyLocally({ value, forbidden, blocklist, minLen, maxLen, textSubtype });
    setTestResult(result);
  };

  const handleTestChange = (val) => {
    setTestValue(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runTest(val), 300);
  };

  const selectedSubtype = TEXT_SUBTYPES.find((s) => s.value === textSubtype);
  const resultColor = testResult?.valid === true ? T.green : T.red;
  const resultBg    = testResult?.valid === true ? T.greenBg : T.redBg;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "7px 10px", borderRadius: 7,
        background: T.purpleBg, border: "1px solid rgba(124,58,237,0.15)",
      }}>
        <Brain size={12} color={T.purple} />
        <span style={{ fontSize: 12, color: T.purple, fontWeight: 600 }}>
          Smart Text Validation — configure what this field expects
        </span>
      </div>

      <div>
        <label style={{
          fontSize: 11.5, fontWeight: 600, color: T.muted,
          textTransform: "uppercase", letterSpacing: 0.5,
          display: "block", marginBottom: 8,
        }}>
          What kind of text is this field?
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {filteredSubtypes.map((st) => {
            const active = textSubtype === st.value;
            return (
              <div
                key={st.value}
                onClick={() => handleSubtypeChange(st.value)}
                style={{
                  padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${active ? T.purple : T.grey200}`,
                  background: active ? T.purpleBg : T.white,
                  transition: "all 0.15s ease", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, marginBottom: 3 }}>{st.icon}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: active ? T.purple : T.text, lineHeight: 1.3 }}>
                  {st.label}
                </div>
                <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2, lineHeight: 1.3 }}>
                  {st.example}
                </div>
              </div>
            );
          })}
        </div>

        {selectedSubtype && selectedSubtype.value !== "custom" && selectedSubtype.autoForbid.length > 0 && (
          <div style={{
            marginTop: 8, padding: "7px 10px", borderRadius: 7,
            background: T.greenBg, border: "1px solid rgba(5,150,105,0.2)",
            display: "flex", alignItems: "flex-start", gap: 6,
          }}>
            <CheckCircle2 size={12} color={T.green} style={{ marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: T.green, lineHeight: 1.5 }}>
              Auto-configured: rejecting <strong>{selectedSubtype.autoForbid.length} category types</strong> that don't belong in a {selectedSubtype.label} field. You can fine-tune below.
            </span>
          </div>
        )}
      </div>

      <div>
        <label style={{
          fontSize: 11.5, fontWeight: 600, color: T.muted,
          textTransform: "uppercase", letterSpacing: 0.5,
          display: "block", marginBottom: 8,
        }}>
          Reject these value types
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {TEXT_FORBIDDEN_CATEGORIES.map((cat) => {
            const active = forbidden.includes(cat.key);
            return (
              <div
                key={cat.key}
                onClick={() => toggleCategory(cat.key)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "8px 11px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${active ? "rgba(204,0,0,0.25)" : T.grey200}`,
                  background: active ? T.redBg : T.white,
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                  border: `1.5px solid ${active ? T.red : T.grey200}`,
                  background: active ? T.red : T.white,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s ease",
                }}>
                  {active && <CheckCheck size={10} color={T.white} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: active ? T.red : T.text }}>
                      {cat.label}
                    </span>
                    <span style={{
                      fontSize: 10.5, color: T.muted,
                      background: T.grey100, padding: "1px 6px",
                      borderRadius: 99, border: `1px solid ${T.grey200}`,
                    }}>
                      {cat.examples}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: T.muted, margin: "2px 0 0", lineHeight: 1.4 }}>
                    {cat.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label style={{
          fontSize: 11.5, fontWeight: 600, color: T.muted,
          textTransform: "uppercase", letterSpacing: 0.5,
          display: "block", marginBottom: 6,
        }}>
          Custom Blocked Values (comma-separated)
        </label>
        <StyledInput
          placeholder="e.g. unknown, nil, N/A, 0000"
          value={blocklist}
          onChange={(e) => setIntelligence("custom_blocklist", e.target.value)}
        />
        <p style={{ fontSize: 11.5, color: T.muted, marginTop: 5 }}>
          These exact values (case-insensitive) will always be rejected.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{
            fontSize: 11.5, fontWeight: 600, color: T.muted,
            textTransform: "uppercase", letterSpacing: 0.5,
            display: "block", marginBottom: 6,
          }}>
            Min Length
          </label>
          <StyledInput
            placeholder="e.g. 3"
            value={minLen}
            onChange={(e) => setIntelligence("min_length", e.target.value)}
          />
        </div>
        <div>
          <label style={{
            fontSize: 11.5, fontWeight: 600, color: T.muted,
            textTransform: "uppercase", letterSpacing: 0.5,
            display: "block", marginBottom: 6,
          }}>
            Max Length
          </label>
          <StyledInput
            placeholder="e.g. 100"
            value={maxLen}
            onChange={(e) => setIntelligence("max_length", e.target.value)}
          />
        </div>
      </div>

      <div style={{
        padding: "12px 13px", borderRadius: 9,
        background: T.purpleBg, border: "1px solid rgba(124,58,237,0.15)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Brain size={12} color={T.purple} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.purple }}>
            Test a sample value
          </span>
          <span style={{ fontSize: 11, color: T.muted }}>(instant — checks against your rules above)</span>
        </div>

        <StyledInput
          placeholder={
            selectedSubtype?.example
              ? `Try: "${selectedSubtype.example.replace("e.g. ", "")}" or something invalid…`
              : `Try: "Sarpanch", "Ramesh Kumar", "N/A"…`
          }
          value={testValue}
          onChange={(e) => handleTestChange(e.target.value)}
        />

        {testResult && (
          <div style={{
            marginTop: 10, padding: "9px 11px", borderRadius: 7,
            background: resultBg,
            border: `1px solid ${resultColor}33`,
            display: "flex", alignItems: "flex-start", gap: 8,
          }}>
            {testResult.valid
              ? <CheckCircle2 size={14} color={T.green} style={{ marginTop: 1, flexShrink: 0 }} />
              : <AlertTriangle size={14} color={T.red} style={{ marginTop: 1, flexShrink: 0 }} />
            }
            <div>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: resultColor }}>
                {testResult.valid ? "Valid value ✓" : "Invalid — will be rejected"}
              </span>
              {!testResult.valid && testResult.category && testResult.category !== "valid" && (
                <span style={{
                  marginLeft: 8, fontSize: 11, fontWeight: 600,
                  background: T.redBg, color: T.red,
                  padding: "1px 7px", borderRadius: 99,
                  border: `1px solid rgba(204,0,0,0.2)`,
                }}>
                  {testResult.category}
                </span>
              )}
              <p style={{ fontSize: 12, color: resultColor, margin: "3px 0 0", opacity: 0.85 }}>
                {testResult.reason}
              </p>
            </div>
          </div>
        )}

        {!testResult && !testValue && (
          <p style={{ fontSize: 11.5, color: T.muted, marginTop: 8, fontStyle: "italic" }}>
            Type any value above to instantly see if it passes your configured rules.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Success Popup ──────────────────────────────────────────── */
function SuccessPopup({ formName, onClose, onGoToDashboard, message }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: T.overlay,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div style={{
        background: T.white, borderRadius: 18,
        padding: "36px 32px", width: "100%", maxWidth: 420,
        textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        position: "relative",
        animation: "popIn 0.22s ease",
      }}>
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 14,
            width: 30, height: 30, borderRadius: "50%",
            border: `1px solid ${T.grey200}`,
            background: T.grey100, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={14} color={T.muted} />
        </button>

        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: T.greenBg,
          border: `2px solid rgba(5,150,105,0.2)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
        }}>
          <CheckCircle2 size={30} color={T.green} />
        </div>

        <h3 style={{ fontSize: 18, fontWeight: 800, color: T.text, margin: "0 0 8px", fontFamily: "'DM Sans', sans-serif" }}>
          Form Saved!
        </h3>
        <p style={{ fontSize: 13.5, color: T.muted, margin: "0 0 6px", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
          Validation rules for
        </p>
        <p style={{
          fontSize: 14, fontWeight: 700, color: T.blue,
          background: T.blueBg, padding: "6px 14px",
          borderRadius: 8, display: "inline-block",
          margin: "0 0 20px", fontFamily: "'DM Sans', sans-serif",
          border: "1px solid rgba(37,99,235,0.15)",
        }}>
          {formName}
        </p>
        <p style={{ fontSize: 13.5, color: T.muted, margin: "0 0 28px", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
          {message || "Rules saved. Your file has been validated and results are on the dashboard."}
        </p>

        <button
          onClick={onGoToDashboard}
          style={{
            width: "100%", padding: "12px 20px",
            background: T.red, border: "none", borderRadius: 10,
            color: T.white, fontSize: 14, fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.redDark; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = T.red; e.currentTarget.style.transform = "none"; }}
        >
          <LayoutDashboard size={16} /> Go to Dashboard
        </button>

        <button
          onClick={onClose}
          style={{
            marginTop: 10, width: "100%", padding: "10px 20px",
            background: "transparent", border: `1px solid ${T.grey200}`,
            borderRadius: 10, color: T.muted,
            fontSize: 13.5, fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            cursor: "pointer", transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.grey100; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          Create Another Form
        </button>
      </div>
    </div>
  );
}

/* ─── Section header ─────────────────────────────────────────── */
function SectionHeader({ icon: Icon, title, subtitle, accent = T.red, bg = T.redBg }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      paddingBottom: 14, borderBottom: `1px solid ${T.grey200}`, marginBottom: 18,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9,
        background: bg, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={17} color={accent} />
      </div>
      <div>
        <p style={{ fontSize: 14.5, fontWeight: 700, color: T.text, margin: 0 }}>{title}</p>
        <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>{subtitle}</p>
      </div>
    </div>
  );
}

/* ─── Styled input ───────────────────────────────────────────── */
function StyledInput({ placeholder, value, onChange, onBlur, style = {} }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onBlur={(e) => { setFocused(false); onBlur && onBlur(e); }}
      onFocus={() => setFocused(true)}
      style={{
        width: "100%", padding: "10px 14px", borderRadius: 9,
        border: `1px solid ${focused ? T.red : T.grey200}`,
        fontSize: 13.5, fontFamily: "'DM Sans', sans-serif",
        color: T.text, background: focused ? T.white : T.grey100,
        outline: "none",
        boxShadow: focused ? "0 0 0 3px rgba(204,0,0,0.10)" : "none",
        transition: "all 0.15s ease", boxSizing: "border-box", ...style,
      }}
    />
  );
}

/* ─── Styled select ──────────────────────────────────────────── */
function StyledSelect({ value, onChange, children, style = {} }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: "relative", ...style }}>
      <select
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "10px 36px 10px 12px", borderRadius: 9,
          border: `1px solid ${focused ? T.red : T.grey200}`,
          fontSize: 13.5, fontFamily: "'DM Sans', sans-serif",
          color: value ? T.text : T.muted,
          background: focused ? T.white : T.grey100,
          outline: "none", appearance: "none", cursor: "pointer",
          boxShadow: focused ? "0 0 0 3px rgba(204,0,0,0.10)" : "none",
          transition: "all 0.15s ease", boxSizing: "border-box",
        }}
      >
        {children}
      </select>
      <ChevronDown
        size={14} color={T.muted}
        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
      />
    </div>
  );
}

/* ─── Field type selector — grouped dropdown ─────────────────── */
function FieldTypeSelector({ value, onChange }) {
  return (
    <StyledSelect value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select field type…</option>
      {FIELD_TYPES.map((group) => (
        <optgroup key={group.group} label={group.group}>
          {group.types.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </optgroup>
      ))}
    </StyledSelect>
  );
}

/* ─── Sub-field renderer (for non-text types) ────────────────── */
function SubFields({ typeDef, rule, onChange }) {
  if (!typeDef?.subFields?.length) return null;
  return (
    <>
      {typeDef.subFields.map((sf) => (
        <div key={sf.key}>
          <label style={{
            fontSize: 11.5, fontWeight: 600, color: T.muted,
            textTransform: "uppercase", letterSpacing: 0.5,
            display: "block", marginBottom: 6,
          }}>
            {sf.label}
          </label>
          {sf.type === "select" ? (
            <StyledSelect
              value={rule?.[sf.key] || ""}
              onChange={(e) => onChange(sf.key, e.target.value)}
            >
              <option value="">Select…</option>
              {sf.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </StyledSelect>
          ) : (
            <StyledInput
              placeholder={sf.placeholder}
              value={rule?.[sf.key] || ""}
              onChange={(e) => onChange(sf.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   SMART SUGGESTION BADGE COMPONENT
   Uses rule-based engine — always provides a suggestion.
───────────────────────────────────────────────────────────── */
function AISuggestionBadge({ columnName, currentType, currentTextSubtype, onAccept }) {
  const [suggestion, setSuggestion] = useState(null);
  const computedFor = useRef(null);

  // Compute suggestion synchronously via rule engine (debounced for UX)
  useEffect(() => {
    if (!columnName.trim() || columnName.trim().length < 3) {
      setSuggestion(null);
      computedFor.current = null;
      return;
    }
    if (computedFor.current === columnName) return;
    const t = setTimeout(() => {
      const result = fetchAISuggestion(columnName);
      if (FIELD_TYPE_MAP[result.type]) {
        setSuggestion(result);
        computedFor.current = columnName;
      }
    }, 400);
    return () => clearTimeout(t);
  }, [columnName]);

  // Reset when column name changes
  useEffect(() => {
    if (computedFor.current && computedFor.current !== columnName) {
      setSuggestion(null);
      computedFor.current = null;
    }
  }, [columnName]);

  if (!suggestion) return null;

  const suggestedType = FIELD_TYPE_MAP[suggestion.type];
  const subtypeLabel  = suggestion.textSubtype
    ? TEXT_SUBTYPES.find((s) => s.value === suggestion.textSubtype)?.label
    : null;

  // "already applied" = type matches AND (no textSubtype suggestion, or it also matches)
  const alreadyApplied =
    currentType === suggestion.type &&
    (!suggestion.textSubtype || currentTextSubtype === suggestion.textSubtype);

  const confidenceColor =
    suggestion.confidence === "high" ? T.green :
    suggestion.confidence === "medium" ? T.orange : T.muted;

  const suggestLabel = subtypeLabel
    ? `${suggestedType?.label} → ${subtypeLabel}`
    : suggestedType?.label;

  return (
    <div style={{
      padding: "9px 11px", borderRadius: 8,
      background: alreadyApplied ? T.greenBg : T.tealBg,
      border: `1px solid ${alreadyApplied ? "rgba(5,150,105,0.22)" : "rgba(8,145,178,0.22)"}`,
      display: "flex", alignItems: "flex-start", gap: 8,
    }}>
      <Sparkles size={13} color={alreadyApplied ? T.green : T.teal} style={{ marginTop: 1, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: alreadyApplied ? T.green : T.teal }}>
            {alreadyApplied ? "Smart suggestion applied ✓" : "Smart suggestion:"}
          </span>
          {!alreadyApplied && (
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: T.teal, background: "rgba(8,145,178,0.12)",
              padding: "1px 8px", borderRadius: 99,
              border: "1px solid rgba(8,145,178,0.2)",
            }}>
              {suggestLabel}
            </span>
          )}
          <span style={{
            fontSize: 10.5, fontWeight: 600, color: confidenceColor,
            background: "rgba(0,0,0,0.04)", padding: "1px 6px", borderRadius: 99,
          }}>
            {suggestion.confidence} confidence
          </span>
        </div>
        <p style={{ fontSize: 11.5, color: T.muted, margin: "3px 0 0", lineHeight: 1.4 }}>
          {suggestion.reason}
        </p>
        {!alreadyApplied && (
          <button
            onClick={() => onAccept(suggestion.type, suggestion.textSubtype)}
            style={{
              marginTop: 7, padding: "5px 12px",
              background: T.teal, border: "none", borderRadius: 6,
              color: T.white, fontSize: 12, fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            <CheckCircle2 size={11} /> Apply suggestion
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   DATE FORMAT FLEXIBILITY NOTE BANNER
───────────────────────────────────────────────────────────── */
function DateFlexibilityNote() {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 6,
      padding: "8px 10px", borderRadius: 7,
      background: T.greenBg, border: "1px solid rgba(5,150,105,0.2)",
    }}>
      <CheckCircle2 size={12} color={T.green} style={{ marginTop: 1, flexShrink: 0 }} />
      <span style={{ fontSize: 11.5, color: T.green, lineHeight: 1.5 }}>
        <strong>Separator-flexible:</strong> dd/mm/yyyy, dd-mm-yyyy, and dd.mm.yyyy are all treated as valid for the same format. Only the day/month/year order matters.
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────── */
const CreateForm = () => {
  const [searchParams] = useSearchParams();

  const [formName, setFormName]           = useState("");
  const [columns, setColumns]             = useState([{ name: "" }]);
  const [rules, setRules]                 = useState({});
  const [loading, setLoading]             = useState(false);
  const [message, setMessage]             = useState({ type: "", text: "" });
  const [showPopup, setShowPopup]         = useState(false);
  const [savedFormName, setSavedFormName] = useState("");
  const [popupMessage, setPopupMessage]   = useState("");

  // FIX 3 & 4: Active column for right-side focus
  const [activeCol, setActiveCol]         = useState(null);

  /* ── Pre-fill from redirect ── */
  useEffect(() => {
    const preFilledForm = searchParams.get("form");
    if (preFilledForm) {
      const formatted = formatFormName(decodeURIComponent(preFilledForm));
      setFormName(formatted);
      try {
        const stored = sessionStorage.getItem("prefill_columns");
        if (stored) {
          const headers = JSON.parse(stored);
          if (Array.isArray(headers) && headers.length > 0) {
            setColumns(headers.map((h) => ({ name: h })));
            sessionStorage.removeItem("prefill_columns");
            setMessage({
              type: "info",
              text: `Redirected to define rules for "${formatted}". We detected ${headers.length} column(s) — review them and set validation rules, then click Save.`,
            });
            return;
          }
        }
      } catch { /* ignore */ }
      setMessage({
        type: "info",
        text: `You were redirected to define validation rules for "${formatted}". Add columns and rules below, then click Save.`,
      });
    }
  }, [searchParams]);

  /* ── Set first valid column as active when columns change ── */
  useEffect(() => {
    const validCols = columns.map((c) => c.name.trim()).filter(Boolean);
    if (validCols.length > 0 && (!activeCol || !validCols.includes(activeCol))) {
      setActiveCol(validCols[0]);
    }
  }, [columns, activeCol]);

  const ruleCardRefs = useRef({});

  /* ── Focus a column — scroll the page so the rule card is centred in the viewport ── */
  const focusColumn = (colName) => {
    setActiveCol(colName);
    setTimeout(() => {
      const card = ruleCardRefs.current[colName];
      if (!card) return;
      const cardRect     = card.getBoundingClientRect();
      const viewportH    = window.innerHeight;
      /* target: card vertically centred in viewport */
      const scrollTarget = window.scrollY + cardRect.top
                           - (viewportH / 2 - cardRect.height / 2);
      window.scrollTo({ top: Math.max(0, scrollTarget), behavior: "smooth" });
    }, 40);
  };

  /* ── Reset ── */
  const resetPage = () => {
    setFormName(""); setColumns([{ name: "" }]); setRules({});
    setLoading(false); setMessage({ type: "", text: "" });
    setShowPopup(false); setSavedFormName(""); setActiveCol(null);
  };

  /* ── Drag-to-reorder refs ── */
  const dragItem = useRef(null);
  const dragOver = useRef(null);

  const reorderColumns = () => {
    if (dragItem.current === null || dragOver.current === null) return;
    if (dragItem.current === dragOver.current) return;
    setColumns((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragItem.current, 1);
      next.splice(dragOver.current, 0, moved);
      return next;
    });
    dragItem.current = null;
    dragOver.current = null;
  };

  const moveColumn = (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= columns.length) return;
    setColumns((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  /* ── Column helpers ── */
  const addColumn = () => setColumns((p) => [...p, { name: "" }]);

  const removeColumn = (idx) => {
    const removed = columns[idx]?.name;
    setColumns((p) => p.filter((_, i) => i !== idx));
    if (removed) setRules((p) => { const n = { ...p }; delete n[removed]; return n; });
  };

  const updateColumnName = (idx, value) => {
    const oldName = columns[idx]?.name;
    setColumns((p) => p.map((c, i) => (i === idx ? { name: value } : c)));
    if (oldName && oldName !== value) {
      setRules((p) => {
        const n = { ...p };
        if (n[oldName]) { n[value] = n[oldName]; delete n[oldName]; }
        return n;
      });
      if (activeCol === oldName) setActiveCol(value);
    }
  };

  const handleRuleChange = (col, field, value) =>
    setRules((p) => ({ ...p, [col]: { ...p[col], [field]: value } }));

  const handleTypeChange = (col, newType, extraProps = {}) =>
    setRules((p) => ({ ...p, [col]: { required: p[col]?.required || false, type: newType, ...extraProps } }));

  /* ── FIX 3: Validate all columns have a type before saving ── */
  const handleSaveRules = async () => {
    const trimmedName = formName.trim();
    const validCols   = columns.map((c) => c.name.trim()).filter(Boolean);

    if (!trimmedName || !validCols.length) {
      setMessage({ type: "error", text: "Please enter a form name and at least one column." });
      return;
    }

    // Check for columns missing a type
    const missingRulesCols = validCols.filter((col) => !rules[col]?.type);
    if (missingRulesCols.length > 0) {
      const colList = missingRulesCols.map((c) => `"${c}"`).join(", ");
      setMessage({
        type: "error",
        text: `Please define field type rules for the following column${missingRulesCols.length > 1 ? "s" : ""} before saving: ${colList}. Form rules will only be saved once all columns have been configured.`,
      });
      // Also auto-focus first missing column
      focusColumn(missingRulesCols[0]);
      return;
    }

    const formatted = formatFormName(trimmedName);
    setFormName(formatted);
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const saveRes = await fetch("http://localhost:8000/SAVE-FORM-RULES", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_name: formatted, columns: validCols, rules }),
      });

      if (!saveRes.ok) {
        const err = await saveRes.json();
        setMessage({ type: "error", text: err.detail || "Failed to save form rules." });
        setLoading(false);
        return;
      }

      setSavedFormName(formatted);

      if (fileStore.file) {
        const fd = new FormData();
        fd.append("file", fileStore.file);
        fd.append("form_type", fileStore.formType);
        fd.append("date", fileStore.date);
        fileStore.file = null;
        fileStore.formType = null;
        fileStore.date = null;
        try {
          const valRes = await fetch("http://localhost:8000/VALIDATE-FORM", {
            method: "POST",
            body: fd,
          });
          if (valRes.ok) {
            setPopupMessage("Rules saved and file validated! Redirecting to dashboard…");
          } else {
            console.error("Re-validation failed after saving rules:", await valRes.text().catch(() => valRes.status));
            setPopupMessage("Rules saved! File re-validation failed — please re-upload from dashboard.");
          }
        } catch (err) {
          console.error("Re-validation request threw an error:", err);
          setPopupMessage("Rules saved! File re-validation failed — please re-upload from dashboard.");
        }
      } else {
        setPopupMessage("Rules saved successfully!");
      }

      setShowPopup(true);

    } catch {
      setMessage({ type: "error", text: "Unable to reach the server. Please try again." });
    }

    setLoading(false);
  };

  const handleGoToDashboard = () => {
    setShowPopup(false);
    window.location.href = "/dashboard";
  };

  const validColumns = columns.map((c) => c.name.trim()).filter(Boolean);

  /* ─────────────────── RENDER ─────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1, minHeight: 0, fontFamily: "'DM Sans', sans-serif" }}>

      {showPopup && (
        <SuccessPopup
          formName={savedFormName}
          onClose={resetPage}
          onGoToDashboard={handleGoToDashboard}
          message={popupMessage}
        />
      )}

      {message.text && (
        <div style={{
          padding: "12px 16px", borderRadius: 9,
          background: message.type === "success" ? T.greenBg : message.type === "info" ? T.orangeBg : T.redBg,
          border: `1px solid ${message.type === "success" ? "rgba(5,150,105,0.2)" : message.type === "info" ? "rgba(217,119,6,0.2)" : "rgba(204,0,0,0.18)"}`,
          color: message.type === "success" ? T.green : message.type === "info" ? T.orange : T.red,
          fontSize: 13.5, fontWeight: 500,
          borderLeft: `3px solid ${message.type === "success" ? T.green : message.type === "info" ? T.orange : T.red}`,
          display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.6,
        }}>
          {message.type === "success" && <CheckCircle2 size={15} color={T.green} style={{ marginTop: 2, flexShrink: 0 }} />}
          {message.type === "error" && <AlertTriangle size={15} color={T.red} style={{ marginTop: 2, flexShrink: 0 }} />}
          {message.text}
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, flex: 1, minHeight: 0 }}>

        {/* ── LEFT: Form Name + Columns ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Form Name */}
          <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`, padding: "22px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <SectionHeader icon={FileSpreadsheet} title="Form Details" subtitle="Enter a name for this template" />
            <label style={{ fontSize: 12, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 7 }}>
              Form Name
            </label>
            <StyledInput
              placeholder="e.g. EB Meter Form"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              onBlur={(e) => setFormName(formatFormName(e.target.value))}
            />
            {formName.trim() && (
              <p style={{ fontSize: 12, color: T.muted, marginTop: 8, margin: "8px 0 0" }}>
                Will be saved as: <strong style={{ color: T.text }}>{formatFormName(formName)}</strong>
              </p>
            )}
          </div>

          {/* Columns */}
          <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`, padding: "22px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", flex: 1, display: "flex", flexDirection: "column" }}>
            <SectionHeader icon={FileSpreadsheet} title="Column Names" subtitle="Click a column to configure its rules on the right" />

            {/* FIX 4: Column completion status summary */}
            {validColumns.length > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                marginBottom: 12, padding: "7px 10px", borderRadius: 8,
                background: T.grey100, border: `1px solid ${T.grey200}`,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: validColumns.filter(c => rules[c]?.type).length === validColumns.length ? T.green : T.orange,
                }} />
                <span style={{ fontSize: 12, color: T.muted }}>
                  <strong style={{ color: T.text }}>
                    {validColumns.filter(c => rules[c]?.type).length} / {validColumns.length}
                  </strong> columns configured
                </span>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {columns.map((col, idx) => {
                const colName = col.name.trim();
                const isActive = colName && colName === activeCol;
                const hasType = colName && rules[colName]?.type;
                const typeDef = hasType ? FIELD_TYPE_MAP[rules[colName].type] : null;

                return (
                  <div
                    key={idx}
                    draggable
                    onDragStart={() => { dragItem.current = idx; }}
                    onDragEnter={() => { dragOver.current = idx; }}
                    onDragEnd={reorderColumns}
                    onDragOver={(e) => e.preventDefault()}
                    style={{
                      display: "flex", gap: 6, alignItems: "center",
                      background: isActive ? T.blueBg : T.white,
                      border: `1px solid ${isActive ? T.blue + "66" : T.grey200}`,
                      borderRadius: 9, padding: "6px 8px",
                      transition: "box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease",
                      cursor: "pointer",
                    }}
                    onClick={() => colName && focusColumn(colName)}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = "#C4C4C7";
                        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.07)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = T.grey200;
                        e.currentTarget.style.boxShadow = "none";
                      }
                    }}
                  >
                    {/* Drag handle */}
                    <div style={{ flexShrink: 0, cursor: "grab", padding: "2px 2px", color: T.muted, display: "flex", alignItems: "center", opacity: 0.45 }}>
                      <GripVertical size={15} />
                    </div>

                    {/* Row number badge */}
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      background: T.grey100, border: `1px solid ${T.grey200}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10.5, fontWeight: 700, color: T.muted,
                    }}>
                      {idx + 1}
                    </div>

                    {/* Input */}
                    <div style={{ flex: 1 }} onClick={(e) => e.stopPropagation()}>
                      <StyledInput
                        placeholder={`Column ${idx + 1} name`}
                        value={col.name}
                        onChange={(e) => updateColumnName(idx, e.target.value)}
                      />
                    </div>

                    {/* Type badge or missing indicator */}
                    {colName && (
                      hasType ? (
                        <div style={{
                          flexShrink: 0,
                          display: "flex", alignItems: "center", gap: 3,
                          background: T.greenBg,
                          border: "1px solid rgba(5,150,105,0.2)",
                          borderRadius: 6, padding: "2px 7px",
                        }}>
                          <CheckCircle2 size={9} color={T.green} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: T.green, whiteSpace: "nowrap" }}>
                            {typeDef?.label?.split(" ")[0] || "Set"}
                          </span>
                        </div>
                      ) : (
                        <div style={{
                          flexShrink: 0,
                          display: "flex", alignItems: "center", gap: 3,
                          background: T.orangeBg,
                          border: "1px solid rgba(217,119,6,0.2)",
                          borderRadius: 6, padding: "2px 7px",
                        }}>
                          <AlertTriangle size={9} color={T.orange} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: T.orange }}>Pending</span>
                        </div>
                      )
                    )}

                    {/* Arrow indicating active */}
                    {isActive && (
                      <ChevronRight size={14} color={T.blue} style={{ flexShrink: 0 }} />
                    )}

                    {/* Up / Down arrows */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => moveColumn(idx, -1)}
                        disabled={idx === 0}
                        title="Move up"
                        style={{
                          width: 22, height: 22, borderRadius: 5,
                          border: `1px solid ${T.grey200}`,
                          background: T.white, cursor: idx === 0 ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          opacity: idx === 0 ? 0.3 : 1, transition: "all 0.12s ease",
                          padding: 0,
                        }}
                        onMouseEnter={(e) => { if (idx !== 0) { e.currentTarget.style.background = T.blueBg; e.currentTarget.style.borderColor = T.blue; } }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = T.white; e.currentTarget.style.borderColor = T.grey200; }}
                      >
                        <ArrowUp size={11} color={T.blue} />
                      </button>
                      <button
                        onClick={() => moveColumn(idx, 1)}
                        disabled={idx === columns.length - 1}
                        title="Move down"
                        style={{
                          width: 22, height: 22, borderRadius: 5,
                          border: `1px solid ${T.grey200}`,
                          background: T.white, cursor: idx === columns.length - 1 ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          opacity: idx === columns.length - 1 ? 0.3 : 1, transition: "all 0.12s ease",
                          padding: 0,
                        }}
                        onMouseEnter={(e) => { if (idx !== columns.length - 1) { e.currentTarget.style.background = T.blueBg; e.currentTarget.style.borderColor = T.blue; } }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = T.white; e.currentTarget.style.borderColor = T.grey200; }}
                      >
                        <ArrowDown size={11} color={T.blue} />
                      </button>
                    </div>

                    {/* Delete */}
                    {columns.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeColumn(idx); }}
                        title="Remove column"
                        style={{
                          width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                          border: `1px solid ${T.grey200}`,
                          background: T.white, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.15s ease", padding: 0,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.borderColor = T.red; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = T.white; e.currentTarget.style.borderColor = T.grey200; }}
                      >
                        <Trash2 size={13} color={T.red} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={addColumn}
              style={{
                marginTop: 12, width: "100%", padding: "9px 14px",
                borderRadius: 9, border: `1.5px dashed ${T.grey200}`,
                background: "transparent", color: T.muted,
                fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 6, transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; e.currentTarget.style.background = T.redBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.grey200; e.currentTarget.style.color = T.muted; e.currentTarget.style.background = "transparent"; }}
            >
              <Plus size={14} /> Add Column
            </button>
          </div>
        </div>

        {/* ── RIGHT: Validation Rules (all columns, full height) ── */}
        <div
          style={{
            background: T.white, borderRadius: 14, border: `1px solid ${T.grey200}`,
            padding: "22px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <SectionHeader
            icon={FileSpreadsheet}
            title="Validation Rules"
            subtitle="Click a column on the left to configure its rules"
            accent={T.blue}
            bg={T.blueBg}
          />

          {validColumns.length === 0 ? (
            <div style={{
              padding: "40px 20px", textAlign: "center",
              color: T.muted, fontSize: 13.5,
              background: T.grey100, borderRadius: 10,
              border: `1.5px dashed ${T.grey200}`,
            }}>
              Add columns on the left to configure validation rules
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {validColumns.map((col) => {
                const rule    = rules[col] || {};
                const typeVal = rule.type || "";
                const typeDef = FIELD_TYPE_MAP[typeVal];
                const isText  = typeVal === "text";
                const isDate  = typeVal === "date" || typeVal === "datetime";
                const isActive = col === activeCol;

                return (
                  <div
                    key={col}
                    ref={(el) => { ruleCardRefs.current[col] = el; }}
                    style={{
                      borderRadius: 10,
                      border: `2px solid ${isActive
                        ? (isText ? T.purple : T.blue)
                        : (isText ? T.purple + "44" : typeVal ? T.blue + "44" : T.grey200)}`,
                      background: isText ? T.purpleBg : typeVal ? T.blueBg : T.grey100,
                      overflow: "hidden",
                      transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
                      boxShadow: isActive ? `0 0 0 3px ${isText ? "rgba(124,58,237,0.12)" : "rgba(37,99,235,0.12)"}` : "none",
                    }}
                  >
                    {/* Column header strip */}
                    <div style={{
                      padding: "10px 14px",
                      background: T.white,
                      borderBottom: `1px solid ${T.grey200}`,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isText
                          ? <Brain size={13} color={T.purple} />
                          : typeDef
                          ? <typeDef.icon size={13} color={T.blue} />
                          : <FileSpreadsheet size={13} color={T.muted} />
                        }
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{col}</span>
                        {typeDef && (
                          <span style={{
                            fontSize: 11, fontWeight: 600,
                            color: isText ? T.purple : T.blue,
                            background: isText ? T.purpleBg : T.blueBg,
                            padding: "2px 8px", borderRadius: 99,
                            border: `1px solid ${isText ? "rgba(124,58,237,0.2)" : "rgba(37,99,235,0.15)"}`,
                          }}>
                            {typeDef.label}
                          </span>
                        )}
                        {isText && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: T.purple,
                            background: "rgba(124,58,237,0.1)",
                            padding: "1px 6px", borderRadius: 99,
                            border: "1px solid rgba(124,58,237,0.18)",
                          }}>
                            AI ✦
                          </span>
                        )}
                        {isActive && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: T.blue,
                            background: T.blueBg,
                            padding: "1px 6px", borderRadius: 99,
                            border: "1px solid rgba(37,99,235,0.2)",
                          }}>
                            ● Active
                          </span>
                        )}
                      </div>

                      {/* Required toggle */}
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
                        <div
                          onClick={() => handleRuleChange(col, "required", !rule.required)}
                          style={{
                            width: 36, height: 20, borderRadius: 99,
                            background: rule.required ? T.red : T.grey200,
                            position: "relative", cursor: "pointer",
                            transition: "background 0.2s ease", flexShrink: 0,
                          }}
                        >
                          <div style={{
                            width: 14, height: 14, borderRadius: "50%",
                            background: T.white,
                            position: "absolute", top: 3,
                            left: rule.required ? 19 : 3,
                            transition: "left 0.2s ease",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                          }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: T.muted }}>Required</span>
                      </label>
                    </div>

                    {/* Rule body */}
                    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>

                      {/* AI Suggestion */}
                      <AISuggestionBadge
                        columnName={col}
                        currentType={typeVal}
                        currentTextSubtype={rule?.text_intelligence?.subtype || ""}
                        onAccept={(t, subtype) => {
                          if (t === "text" && subtype) {
                            const subtypeDef = TEXT_SUBTYPES.find((s) => s.value === subtype);
                            handleTypeChange(col, t, {
                              text_intelligence: {
                                subtype,
                                forbidden_categories: subtypeDef?.autoForbid || [],
                              },
                            });
                          } else if (t === "number") {
                            const defaultUnit = getDefaultUnit(col);
                            handleTypeChange(col, t, defaultUnit ? { unit: defaultUnit } : {});
                          } else {
                            handleTypeChange(col, t);
                          }
                        }}
                      />

                      <div>
                        <label style={{
                          fontSize: 11.5, fontWeight: 600, color: T.muted,
                          textTransform: "uppercase", letterSpacing: 0.5,
                          display: "block", marginBottom: 6,
                        }}>
                          Field Type
                        </label>
                        <FieldTypeSelector
                          value={typeVal}
                          onChange={(v) => handleTypeChange(col, v)}
                        />
                      </div>

                      {typeDef?.desc && (
                        <div style={{
                          display: "flex", alignItems: "flex-start", gap: 6,
                          padding: "8px 10px", borderRadius: 7,
                          background: isText ? "rgba(124,58,237,0.05)" : "rgba(37,99,235,0.05)",
                          border: `1px solid ${isText ? "rgba(124,58,237,0.12)" : "rgba(37,99,235,0.12)"}`,
                        }}>
                          <Info size={12} color={isText ? T.purple : T.blue} style={{ marginTop: 1, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: isText ? T.purple : T.blue, lineHeight: 1.5 }}>{typeDef.desc}</span>
                        </div>
                      )}

                      {typeVal === "number" && rules[col]?.unit && rules[col].unit !== "" && (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "7px 10px", borderRadius: 7,
                          background: "rgba(37,99,235,0.06)",
                          border: "1px solid rgba(37,99,235,0.15)",
                        }}>
                          <Hash size={12} color={T.blue} />
                          <span style={{ fontSize: 12, color: T.blue, fontWeight: 600 }}>
                            Unit: {rules[col].unit === "custom"
                              ? (rules[col].unit_custom || "Custom")
                              : rules[col].unit}
                          </span>
                        </div>
                      )}

                      {isDate && <DateFlexibilityNote />}

                      {isText && (
                        <TextIntelligenceConfig
                          col={col}
                          rule={rule}
                          onChange={(field, val) => handleRuleChange(col, field, val)}
                        />
                      )}

                      {!isText && (
                        <SubFields
                          typeDef={typeDef}
                          rule={rule}
                          onChange={(field, val) => handleRuleChange(col, field, val)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Action row ── */}
      <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
        <button
          onClick={handleSaveRules}
          disabled={loading}
          style={{
            flex: 1, padding: "14px 20px",
            background: loading ? T.grey200 : T.red,
            border: "none", borderRadius: 10,
            color: loading ? T.muted : T.white,
            fontSize: 14, fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = T.redDark; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 18px rgba(204,0,0,0.28)"; } }}
          onMouseLeave={(e) => { if (!loading) { e.currentTarget.style.background = T.red; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; } }}
        >
          {loading ? (
            <>
              <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid rgba(0,0,0,0.15)`, borderTop: `2px solid ${T.muted}`, animation: "spin 0.8s linear infinite" }} />
              Saving…
            </>
          ) : (
            <><FileSpreadsheet size={16} /> Save Form Rules</>
          )}
        </button>
      </div>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
};

export default CreateForm;
