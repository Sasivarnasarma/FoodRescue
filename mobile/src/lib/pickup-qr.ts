export interface ParsedQrPickupPayload {
  listingId: string;
  version?: number;
  isValid: boolean;
  error?: string;
}

/**
 * Parses QR code data or manual reference text to extract the listingId.
 * Supports JSON payloads {"listingId": "...", "version": 1},
 * URI schemes foodrescue://pickup?listingId=..., or raw listing ID strings.
 */
export function parsePickupQrPayload(raw: string): ParsedQrPickupPayload {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return { listingId: '', isValid: false, error: 'Empty QR code data.' };
  }

  const text = raw.trim();

  // 1. Try parsing JSON format: { "listingId": "abc", "version": 1 }
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      const id =
        typeof parsed.listingId === 'string' ? parsed.listingId.trim() : '';
      if (id) {
        return {
          listingId: id,
          version:
            typeof parsed.version === 'number' ? parsed.version : undefined,
          isValid: true,
        };
      }
    }
  } catch {
    // Not JSON, proceed
  }

  // 2. Try URI format: foodrescue://pickup?listingId=abc
  if (text.includes('://')) {
    try {
      const url = new URL(text);
      const idParam =
        url.searchParams.get('listingId') ||
        url.pathname.split('/').filter(Boolean).pop();
      if (idParam) {
        return { listingId: idParam.trim(), isValid: true };
      }
    } catch {
      // Ignore URL parse error
    }
  }

  // 3. Plain listing ID string
  if (/^[a-zA-Z0-9_-]{1,128}$/.test(text)) {
    return { listingId: text, isValid: true };
  }

  return { listingId: text, isValid: text.length > 0 };
}

/**
 * Generates standard JSON QR payload for recipient handover.
 */
export function generatePickupQrPayload(
  listingId: string,
  version = 1,
): string {
  return JSON.stringify({ listingId, version });
}
