import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { AccountButton, AccountField, AccountError } from './donor-controls';
import { LocationPickerCard } from './location-picker-card';
import { PhotoAttachmentCard } from './photo-attachment-card';
import type { CompressedPhotoResult } from '../lib/image-service';
import {
  localDateText,
  parseLocalDate,
  positiveQuantity,
} from '../lib/listing-form-validation';
import {
  FOOD_CATEGORIES,
  createDraftListing,
  updateDraftListing,
  publishListing,
  uploadListingPhoto,
  deleteListingPhoto,
  getListingPhotoBase64,
  type FoodListing,
  type FoodCategory,
  type ListingUnit,
  type StorageRequirement,
  type AllergenDeclaration,
  type PublishListingInput,
  type Coordinates,
} from '../lib/listings';
interface Props {
  initialListing?: FoodListing;
  onSuccess: () => void;
  onCancel: () => void;
}
export function DonorListingForm({
  initialListing: initial,
  onSuccess,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<FoodCategory>(
    initial?.category || 'Bakery',
  );
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1));
  const [unit, setUnit] = useState<ListingUnit>(initial?.unit ?? 'pack');
  const [storage, setStorage] = useState<StorageRequirement>(
    initial?.storageRequirement ?? 'ambient',
  );
  const [instructions, setInstructions] = useState(
    initial?.storageInstructions ?? '',
  );
  const [declaration, setDeclaration] = useState<AllergenDeclaration>(
    initial?.allergenDeclaration ?? 'unknown',
  );
  const [allergens, setAllergens] = useState(initial?.allergenInfo ?? '');
  const [address, setAddress] = useState(initial?.pickupAddress ?? '');
  const [location, setLocation] = useState<Coordinates | null>(
    initial?.pickupLocation ?? null,
  );
  const [starts, setStarts] = useState(() =>
    localDateText(initial?.pickupStartsAt ?? new Date(Date.now() + 1800000)),
  );
  const [deadline, setDeadline] = useState(() =>
    localDateText(initial?.pickupDeadline ?? new Date(Date.now() + 9000000)),
  );
  const [bestBefore, setBestBefore] = useState(
    localDateText(initial?.bestBeforeAt),
  );
  const [useBy, setUseBy] = useState(localDateText(initial?.useByAt));
  const [photo, setPhoto] = useState<CompressedPhotoResult | null>(null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(!!initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const draftId = useRef(initial?.id);
  useEffect(() => {
    if (!initial) return;
    let active = true;
    getListingPhotoBase64(initial.id)
      .then((base64) => {
        if (active && base64)
          setPhoto({
            uri: `data:image/jpeg;base64,${base64}`,
            base64,
            byteSize: Math.floor((base64.length * 3) / 4),
            width: 0,
            height: 0,
          });
      })
      .catch(() => {
        if (active)
          setError(
            'Photo preview unavailable. The existing photo will be kept unless you replace or remove it.',
          );
      })
      .finally(() => {
        if (active) setPhotoLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initial]);
  async function save(publish: boolean) {
    if (locked.current) return;
    locked.current = true;
    setError('');
    try {
      if (!title.trim()) throw new Error('Enter a listing title.');
      const data = {
        title: title.trim(),
        description: description.trim(),
        category,
        quantity: positiveQuantity(quantity),
        unit,
        storageRequirement: storage,
        storageInstructions: instructions.trim(),
        allergenInfo: declaration === 'unknown' ? '' : allergens.trim(),
        allergenDeclaration: declaration,
        pickupAddress: address.trim(),
        pickupLocation: location,
        pickupStartsAt: starts.trim() ? parseLocalDate(starts) : null,
        pickupDeadline: deadline.trim() ? parseLocalDate(deadline) : null,
        bestBeforeAt: bestBefore.trim() ? parseLocalDate(bestBefore) : null,
        useByAt: useBy.trim() ? parseLocalDate(useBy) : null,
      };
      if (publish) {
        if (!data.description) throw new Error('Describe the donation.');
        if (!data.pickupAddress || !data.pickupLocation)
          throw new Error(
            'Enter the pickup address and select GPS or manual coordinates.',
          );
        if (
          !data.pickupStartsAt ||
          !data.pickupDeadline ||
          data.pickupStartsAt >= data.pickupDeadline
        )
          throw new Error('Pickup start must precede the deadline.');
        if (data.pickupDeadline.getTime() <= Date.now())
          throw new Error('Pickup deadline must be in the future.');
        if (data.useByAt && data.pickupDeadline > data.useByAt)
          throw new Error('Pickup deadline must be at or before use-by.');
        if (declaration === 'provided' && !allergens.trim())
          throw new Error('Enter allergen details, or choose unknown.');
      }
      setBusy(true);
      if (!draftId.current) draftId.current = await createDraftListing(data);
      else await updateDraftListing(draftId.current, data);
      if (photoChanged) {
        if (photo) await uploadListingPhoto(draftId.current, photo.base64);
        else await deleteListingPhoto(draftId.current);
      }
      if (publish)
        await publishListing(draftId.current, data as PublishListingInput);
      onSuccess();
    } catch (cause) {
      setError(
        `${cause instanceof Error ? cause.message : 'Could not save.'}${draftId.current ? ' Your draft is saved. Retry to continue with the same draft.' : ''}`,
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function choices<T extends string>(
    label: string,
    values: readonly T[],
    current: T,
    change: (v: T) => void,
  ) {
    return (
      <View style={{ gap: 6 }}>
        <Text>{label}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {values.map((value) => (
            <AccountButton
              key={value}
              label={current === value ? `✓ ${value}` : value}
              secondary={current !== value}
              disabled={busy}
              onPress={() => change(value)}
            />
          ))}
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header">
        {initial ? 'Edit draft' : 'New donation'}
      </Text>
      {error ? <AccountError message={error} /> : null}
      <AccountField
        label="Title"
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        editable={!busy}
      />
      <AccountField
        label="Description"
        value={description}
        onChangeText={setDescription}
        maxLength={1000}
        multiline
        editable={!busy}
      />
      {choices('Category', FOOD_CATEGORIES, category, setCategory)}
      <AccountField
        label="Whole quantity"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="number-pad"
        editable={!busy}
      />
      {choices(
        'Unit',
        ['pack', 'portion', 'item', 'g'] as const,
        unit,
        setUnit,
      )}
      {choices(
        'Required storage',
        ['ambient', 'chilled', 'frozen'] as const,
        storage,
        setStorage,
      )}
      <AccountField
        label="Storage instructions"
        value={instructions}
        onChangeText={setInstructions}
        maxLength={500}
        editable={!busy}
      />
      {choices(
        'Allergen declaration',
        ['unknown', 'provided'] as const,
        declaration,
        setDeclaration,
      )}
      {declaration === 'provided' && (
        <AccountField
          label="Allergen details"
          value={allergens}
          onChangeText={setAllergens}
          maxLength={500}
          editable={!busy}
        />
      )}
      <LocationPickerCard
        location={location}
        address={address}
        onLocationChange={(coords, label) => {
          setLocation(coords);
          setAddress(label);
        }}
        disabled={busy}
      />
      <Text>Enter times in your device time zone as YYYY-MM-DD HH:mm.</Text>
      <AccountField
        label="Pickup starts"
        value={starts}
        onChangeText={setStarts}
        editable={!busy}
      />
      <AccountField
        label="Pickup deadline"
        value={deadline}
        onChangeText={setDeadline}
        editable={!busy}
      />
      <AccountField
        label="Best-before (optional)"
        value={bestBefore}
        onChangeText={setBestBefore}
        editable={!busy}
      />
      <AccountField
        label="Use-by (optional)"
        value={useBy}
        onChangeText={setUseBy}
        editable={!busy}
      />
      {photoLoading ? (
        <ActivityIndicator accessibilityLabel="Loading photo" />
      ) : (
        <PhotoAttachmentCard
          photo={photo}
          onPhotoSelected={(value) => {
            setPhoto(value);
            setPhotoChanged(true);
          }}
          disabled={busy}
        />
      )}
      <AccountButton
        label={busy ? 'Saving…' : 'Save draft'}
        disabled={busy || photoLoading}
        onPress={() => void save(false)}
      />
      <AccountButton
        label="Publish donation"
        disabled={busy || photoLoading}
        onPress={() => void save(true)}
      />
      <AccountButton
        label="Back to donations"
        secondary
        disabled={busy}
        onPress={onCancel}
      />
    </View>
  );
}
