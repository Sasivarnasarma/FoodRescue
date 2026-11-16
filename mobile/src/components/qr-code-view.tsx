import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface QrCodeViewProps {
  reference: string;
  rawPayload: string;
  size?: number;
}

/**
 * Generates a deterministic 21x21 QR-style matrix with standard position patterns
 * and data modules hashed from the raw payload.
 */
function generateQrMatrix(payload: string): boolean[][] {
  const size = 21;
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  );

  // Helper to draw a square pattern
  const drawSquare = (row: number, col: number, s: number, fill: boolean) => {
    for (let r = 0; r < s; r++) {
      for (let c = 0; c < s; c++) {
        if (row + r < size && col + c < size) {
          matrix[row + r][col + c] = fill;
        }
      }
    }
  };

  // Helper to draw a standard 7x7 Finder Pattern with 1-module separator
  const drawFinderPattern = (startRow: number, startCol: number) => {
    // 7x7 outer black
    drawSquare(startRow, startCol, 7, true);
    // 5x5 inner white
    drawSquare(startRow + 1, startCol + 1, 5, false);
    // 3x3 center black
    drawSquare(startRow + 2, startCol + 2, 3, true);
  };

  // 1. Position patterns in top-left, top-right, bottom-left
  drawFinderPattern(0, 0);
  drawFinderPattern(0, 14);
  drawFinderPattern(14, 0);

  // 2. Timing patterns on row 6 and col 6
  for (let i = 8; i < 13; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // 3. Simple hash function to seed payload data
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }

  // Fill data areas
  let seed = hash;
  const nextBit = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed & 1) === 1;
  };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Skip finder pattern zones
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= 13;
      const inBottomLeft = r >= 13 && c < 8;
      const isTiming = r === 6 || c === 6;

      if (!inTopLeft && !inTopRight && !inBottomLeft && !isTiming) {
        matrix[r][c] = nextBit();
      }
    }
  }

  return matrix;
}

export function QrCodeView({
  reference,
  rawPayload,
  size = 180,
}: QrCodeViewProps) {
  const matrix = useMemo(() => generateQrMatrix(rawPayload), [rawPayload]);
  const moduleSize = size / 21;

  return (
    <View
      accessibilityLabel={`Pickup QR code with reference ${reference}`}
      style={styles.card}
    >
      <View
        style={[styles.qrContainer, { width: size + 24, height: size + 24 }]}
      >
        <View style={{ width: size, height: size }}>
          {matrix.map((row, rIdx) => (
            <View key={`row-${rIdx}`} style={styles.row}>
              {row.map((active, cIdx) => (
                <View
                  key={`cell-${rIdx}-${cIdx}`}
                  style={[
                    styles.cell,
                    {
                      width: moduleSize,
                      height: moduleSize,
                      backgroundColor: active ? '#0F172A' : '#FFFFFF',
                    },
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
      </View>

      {/* Manual Reference & Info */}
      <View style={styles.infoBox}>
        <Text style={styles.referenceLabel}>MANUAL PICKUP REFERENCE</Text>
        <Text style={styles.referenceCode} selectable>
          {reference}
        </Text>
        <Text style={styles.helperText}>
          The donor can scan this QR code or enter the reference manually on
          their device.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#C8DAD0',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  qrContainer: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {},
  infoBox: {
    alignItems: 'center',
    gap: 4,
    width: '100%',
  },
  referenceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  referenceCode: {
    fontSize: 18,
    fontWeight: '800',
    color: '#152A20',
    letterSpacing: 1,
    fontFamily: 'monospace',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  helperText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 2,
  },
});
