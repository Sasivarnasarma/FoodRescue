import { getBase64ByteLength } from './listing-helpers';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export const MAX_ALLOWED_PHOTO_BYTES = 153600; // 150 KiB (Spark MVP Firestore limit)

export interface CompressedPhotoResult {
  uri: string;
  base64: string;
  byteSize: number;
  width: number;
  height: number;
}

/**
 * Calculates byte size from a base64 encoded string.
 */
export { getBase64ByteLength } from './listing-helpers';
/**
 * Iteratively resizes and compresses an image to guarantee it stays strictly under 150 KiB (153,600 bytes).
 */
export async function compressListingPhoto(
  sourceUri: string,
): Promise<CompressedPhotoResult> {
  const compressionProfiles = [
    { maxWidth: 800, quality: 0.7 },
    { maxWidth: 700, quality: 0.6 },
    { maxWidth: 600, quality: 0.5 },
    { maxWidth: 500, quality: 0.4 },
    { maxWidth: 400, quality: 0.3 },
    { maxWidth: 240, quality: 0.2 },
  ];

  let lastResult: CompressedPhotoResult | null = null;

  for (const profile of compressionProfiles) {
    const manipResult = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: profile.maxWidth } }],
      {
        compress: profile.quality,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );

    if (!manipResult.base64) {
      throw new Error('Failed to encode compressed image to base64.');
    }

    const byteSize = getBase64ByteLength(manipResult.base64);
    lastResult = {
      uri: manipResult.uri,
      base64: manipResult.base64,
      byteSize,
      width: manipResult.width,
      height: manipResult.height,
    };

    if (byteSize <= MAX_ALLOWED_PHOTO_BYTES) {
      return lastResult;
    }
  }

  if (lastResult && lastResult.byteSize <= MAX_ALLOWED_PHOTO_BYTES) {
    return lastResult;
  }

  throw new Error(
    `Image exceeds 150 KiB (${Math.round((lastResult?.byteSize ?? 0) / 1024)} KiB). Please choose a smaller photo.`,
  );
}

/**
 * Opens device camera to capture a photo, then compresses it under 150 KiB.
 */
export async function capturePhotoFromCamera(): Promise<CompressedPhotoResult | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Camera permission is required to capture listing photos.');
  }

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [4, 3],
    mediaTypes: ['images'],
    quality: 0.8,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  return compressListingPhoto(asset.uri);
}

/**
 * Opens photo library to select a photo, then compresses it under 150 KiB.
 */
export async function pickPhotoFromGallery(): Promise<CompressedPhotoResult | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.8,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  return compressListingPhoto(asset.uri);
}
