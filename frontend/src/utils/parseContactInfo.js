const PHONE_RE = /(\+?\d[\d\s().\-]{6,}\d)/;
const EMAIL_RE = /([^\s,;|]+@[^\s,;|]+\.[^\s,;|]+)/;
const LABEL_RE = /^(phone|tel|telephone|email|e-mail|address|addr)\s*:\s*/i;

const countDigits = (s) => (s.match(/\d/g) || []).length;

export function parseContactInfo(raw) {
  const result = { phone: null, email: null, address: null, other: [] };
  if (!raw || typeof raw !== 'string') return result;

  const pieces = raw.split(/[\n;|]/).map((p) => p.trim()).filter(Boolean);

  if (pieces.length > 1) {
    for (const piece of pieces) {
      const cleaned = piece.replace(LABEL_RE, '').trim();
      if (!cleaned) continue;
      const emailMatch = cleaned.match(EMAIL_RE);
      if (!result.email && emailMatch) {
        result.email = emailMatch[0];
        continue;
      }
      const phoneMatch = cleaned.match(PHONE_RE);
      if (!result.phone && phoneMatch && countDigits(phoneMatch[0]) >= 7) {
        result.phone = phoneMatch[0].trim();
        continue;
      }
      if (!result.address) result.address = cleaned;
      else result.other.push(cleaned);
    }
    return result;
  }

  const emailMatch = raw.match(EMAIL_RE);
  if (emailMatch) result.email = emailMatch[0];
  let remaining = emailMatch ? raw.replace(emailMatch[0], '') : raw;
  const phoneMatch = remaining.match(PHONE_RE);
  if (phoneMatch && countDigits(phoneMatch[0]) >= 7) {
    result.phone = phoneMatch[0].trim();
    remaining = remaining.replace(phoneMatch[0], '');
  }
  remaining = remaining.replace(LABEL_RE, '').replace(/[,\s]+/g, ' ').trim();
  if (remaining) result.address = remaining;
  return result;
}
