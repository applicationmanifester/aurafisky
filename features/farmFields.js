// features/farmFields.js
// ── SAVED FIELDS ─────────────────────────────────────────────────────
//
// Lets a farmer save multiple named fields, each with its own soil texture,
// sowing date and active crop. Stored in localStorage only — never leaves
// the device.
//
// Shape:
//   [
//     { id: string, name: string, lat: number, lng: number,
//       soilId: string, soilSource: 'manual'|'soilgrids',
//       sowingDate: string|null, cropId: string|null, notes: string }
//   ]

export const FARM_FIELDS_KEY = "aurafisky_farm_fields";

/** Reads all saved fields. Pure — safe to call in tests. */
export function loadFields() {
  try {
    const raw = localStorage.getItem(FARM_FIELDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f) => f && typeof f.lat === "number" && typeof f.lng === "number");
  } catch {
    return [];
  }
}

/** Persists all fields. */
function saveFields(fields) {
  try {
    localStorage.setItem(FARM_FIELDS_KEY, JSON.stringify(fields));
  } catch {
    /* storage unavailable */
  }
}

/** Adds a field and returns it with an id. */
export function addField(field) {
  const fields = loadFields();
  const newField = {
    id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...field,
    soilSource: field.soilSource || "manual",
    sowingDate: field.sowingDate || null,
    cropId: field.cropId || null,
    notes: field.notes || "",
  };
  fields.push(newField);
  saveFields(fields);
  return newField;
}

/** Removes a field by id. Returns true if removed. */
export function removeField(id) {
  const fields = loadFields();
  const before = fields.length;
  const filtered = fields.filter((f) => f.id !== id);
  if (filtered.length < before) {
    saveFields(filtered);
    return true;
  }
  return false;
}

/** Updates a field by id. */
export function updateField(id, patch) {
  const fields = loadFields();
  const idx = fields.findIndex((f) => f.id === id);
  if (idx === -1) return null;
  fields[idx] = { ...fields[idx], ...patch };
  saveFields(fields);
  return fields[idx];
}

/** Returns a single field by id. */
export function getField(id) {
  return loadFields().find((f) => f.id === id) || null;
}

/** Sets the active field id (used by the farm UI to switch fields). */
export const FARM_ACTIVE_FIELD_KEY = "aurafisky_farm_active_field";

export function getActiveFieldId() {
  try {
    return localStorage.getItem(FARM_ACTIVE_FIELD_KEY) || null;
  } catch {
    return null;
  }
}

export function setActiveFieldId(id) {
  try {
    localStorage.setItem(FARM_ACTIVE_FIELD_KEY, id || "");
  } catch {
    /* storage unavailable */
  }
}

/** Days since sowing, from sowingDate (ISO date string). */
export function daysSinceSowing(sowingDate, now = Date.now()) {
  if (!sowingDate) return null;
  const sown = new Date(sowingDate + "T00:00:00").getTime();
  if (isNaN(sown)) return null;
  return Math.floor((now - sown) / (1000 * 60 * 60 * 24));
}
