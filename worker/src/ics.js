// Calendar invites (.ics) that Gmail, Outlook and Apple Calendar understand.
// The UID stays the same for a booking, so a reschedule or cancellation updates the
// event the client already added instead of creating a second one.

const stamp = (iso) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);

// Lines longer than 75 octets must be folded
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs({ booking, typeName, ownerName, ownerEmail, manageUrl, method = "REQUEST" }) {
  const cancelled = method === "CANCEL";
  const desc = [
    `${typeName} with ${ownerName}.`,
    booking.meet_url ? `Join: ${booking.meet_url}` : "",
    manageUrl ? `Reschedule or cancel: ${manageUrl}` : ""
  ].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ahmedeldegla.com//booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${booking.id}@ahmedeldegla.com`,
    `SEQUENCE:${booking.sequence || 0}`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(booking.start_utc)}`,
    `DTEND:${stamp(booking.end_utc)}`,
    `SUMMARY:${escText(`${typeName} with ${ownerName}`)}`,
    `DESCRIPTION:${escText(desc)}`,
    booking.meet_url ? `LOCATION:${escText(booking.meet_url)}` : "",
    booking.meet_url ? `URL:${booking.meet_url}` : "",
    `ORGANIZER;CN=${escText(ownerName)}:mailto:${ownerEmail}`,
    `ATTENDEE;CN=${escText(booking.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${booking.email}`,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    cancelled ? "" : "BEGIN:VALARM\r\nTRIGGER:-PT15M\r\nACTION:DISPLAY\r\nDESCRIPTION:Call starts in 15 minutes\r\nEND:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean);
  return lines.map((l) => (l.includes("\r\n") ? l : fold(l))).join("\r\n") + "\r\n";
}

export function googleCalendarLink({ title, start, end, details, location }) {
  return "https://calendar.google.com/calendar/render?action=TEMPLATE"
    + `&text=${encodeURIComponent(title)}&dates=${stamp(start)}/${stamp(end)}`
    + `&details=${encodeURIComponent(details || "")}`
    + (location ? `&location=${encodeURIComponent(location)}` : "");
}

export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
