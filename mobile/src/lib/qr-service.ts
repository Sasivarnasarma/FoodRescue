import QRCode from 'qrcode';

export const CURRENT_QR_VERSION = 1;
export const QR_PREFIX = 'foodrescue';
export const MAX_REFERENCE_LENGTH = 128;
export const MAX_QR_PAYLOAD_LENGTH = 256;

export interface QrParseResult {
  valid: boolean;
  listingId?: string;
  version?: number;
  error?: string;
}

export interface QrMatrix {
  size: number;
  modules: boolean[][];
}

/**
 * Validates that an ID is a valid Firestore document ID format:
 * Alphanumeric characters, dashes, and underscores; between 1 and 128 characters.
 */
export function isValidListingId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_REFERENCE_LENGTH) return false;
  // Firestore IDs are alphanumeric, hyphens, and underscores
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

/**
 * Encodes an opaque listing ID into a standardized, versioned FoodRescue QR payload.
 * Example: "foodrescue:v1:list_abc123"
 */
export function encodePickupQrPayload(
  listingId: string,
  version = CURRENT_QR_VERSION,
): string {
  if (!isValidListingId(listingId)) {
    throw new Error(
      `Invalid listing ID for QR generation. Must be 1-${MAX_REFERENCE_LENGTH} alphanumeric characters, dashes, or underscores.`,
    );
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('QR payload version must be a positive integer.');
  }

  return `${QR_PREFIX}:v${version}:${listingId.trim()}`;
}

/**
 * Parses and strictly validates a scanned QR payload or manually typed reference ID.
 * Rejects arbitrary URLs, invalid versions, oversized payloads, and malformed strings.
 */
export function parsePickupReference(rawInput: unknown): QrParseResult {
  if (typeof rawInput !== 'string') {
    return {
      valid: false,
      error: 'Pickup reference must be a string.',
    };
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'Enter or scan a pickup reference code.',
    };
  }

  if (trimmed.length > MAX_QR_PAYLOAD_LENGTH) {
    return {
      valid: false,
      error: 'Pickup reference exceeds maximum supported length.',
    };
  }

  // Reject arbitrary external web URLs
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('ftp://') ||
    lower.startsWith('www.')
  ) {
    return {
      valid: false,
      error: 'External URLs are not valid FoodRescue pickup references.',
    };
  }

  // Check if it has the versioned FoodRescue prefix
  if (lower.startsWith(`${QR_PREFIX}:`)) {
    const parts = trimmed.split(':');
    if (parts.length !== 3) {
      return {
        valid: false,
        error: 'Malformed FoodRescue QR payload format.',
      };
    }

    const [, versionPart, idPart] = parts;
    const versionMatch = /^v(\d+)$/i.exec(versionPart);
    if (!versionMatch) {
      return {
        valid: false,
        error: 'Invalid QR version format.',
      };
    }

    const version = Number(versionMatch[1]);
    if (version !== CURRENT_QR_VERSION) {
      return {
        valid: false,
        version,
        error: `Unsupported QR version (v${version}). Please update your FoodRescue app.`,
      };
    }

    const listingId = idPart.trim();
    if (!isValidListingId(listingId)) {
      return {
        valid: false,
        error: 'QR code contains an invalid listing reference ID.',
      };
    }

    return {
      valid: true,
      listingId,
      version,
    };
  }

  // Fallback: Manually entered plain listing ID
  if (isValidListingId(trimmed)) {
    return {
      valid: true,
      listingId: trimmed,
      version: CURRENT_QR_VERSION,
    };
  }

  return {
    valid: false,
    error: 'Invalid pickup reference ID. Check the code and try again.',
  };
}

/**
 * Generates a 2D boolean module matrix for rendering a QR code.
 * Uses pure JavaScript QR matrix creation without native dependencies.
 */
export function generateQrMatrix(payload: string): QrMatrix {
  const qr = QRCode.create(payload, {
    errorCorrectionLevel: 'M',
  });

  const size = qr.modules.size;
  const modules: boolean[][] = [];

  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      row.push(Boolean(qr.modules.get(r, c)));
    }
    modules.push(row);
  }

  return { size, modules };
}
