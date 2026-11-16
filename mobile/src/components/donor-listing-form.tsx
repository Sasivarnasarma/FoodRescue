import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
      <View style={styles.choiceGroup}>
        <Text style={styles.sectionLabel}>{label}</Text>
        <View style={styles.choiceChipsRow}>
          {values.map((value) => {
            const isSelected = current === value;
            return (
              <TouchableOpacity
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.choiceChip,
                  isSelected && styles.choiceChipActive,
                ]}
                disabled={busy}
                onPress={() => change(value)}
              >
                <Text
                  style={[
                    styles.choiceChipText,
                    isSelected && styles.choiceChipTextActive,
                  ]}
                >
                  {isSelected ? `✓ ${value}` : value}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {initial ? 'Edit draft' : 'New donation'}
        </Text>
        <Text style={styles.subtitle}>
          Share surplus food with verified community organizations
        </Text>
      </View>

      {error ? <AccountError message={error} /> : null}

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>1. Food Details</Text>
        <AccountField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Fresh Baked Croissants"
          maxLength={120}
          editable={!busy}
        />
        <AccountField
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Describe preparation, ingredients, quantity details..."
          maxLength={1000}
          multiline
          editable={!busy}
        />
        {choices('Category', FOOD_CATEGORIES, category, setCategory)}
        <View style={styles.quantityRow}>
          <View style={styles.quantityColumn}>
            <AccountField
              label="Whole quantity"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
              editable={!busy}
            />
          </View>
          <View style={styles.quantityColumn}>
            {choices(
              'Unit',
              ['pack', 'portion', 'item', 'g'] as const,
              unit,
              setUnit,
            )}
          </View>
        </View>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>2. Storage & Safety</Text>
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
          placeholder="e.g. Keep chilled below 4°C, consume within 24h"
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
            placeholder="e.g. Contains gluten, dairy, traces of nuts"
            maxLength={500}
            editable={!busy}
          />
        )}
      </View>

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>3. Pickup Logistics</Text>
        <LocationPickerCard
          location={location}
          address={address}
          onLocationChange={(coords, label) => {
            setLocation(coords);
            setAddress(label);
          }}
          disabled={busy}
        />
        <View style={styles.helperNoteBox}>
          <Text style={styles.helperNoteText}>
            ℹ️ Enter times in your device time zone as YYYY-MM-DD HH:mm
          </Text>
        </View>
        <AccountField
          label="Pickup starts"
          value={starts}
          onChangeText={setStarts}
          placeholder="YYYY-MM-DD HH:mm"
          editable={!busy}
        />
        <AccountField
          label="Pickup deadline"
          value={deadline}
          onChangeText={setDeadline}
          placeholder="YYYY-MM-DD HH:mm"
          editable={!busy}
        />
        <AccountField
          label="Best-before (optional)"
          value={bestBefore}
          onChangeText={setBestBefore}
          placeholder="YYYY-MM-DD HH:mm"
          editable={!busy}
        />
        <AccountField
          label="Use-by (optional)"
          value={useBy}
          onChangeText={setUseBy}
          placeholder="YYYY-MM-DD HH:mm"
          editable={!busy}
        />
      </View>

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>4. Photo (optional)</Text>
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
      </View>

      <View style={styles.actionGroup}>
        <AccountButton
          label={busy ? 'Publishing…' : 'Publish donation'}
          disabled={busy || photoLoading}
          onPress={() => void save(true)}
        />
        <AccountButton
          label={busy ? 'Saving…' : 'Save draft'}
          secondary
          disabled={busy || photoLoading}
          onPress={() => void save(false)}
        />
        <AccountButton
          label="Cancel / Back to donations"
          secondary
          disabled={busy}
          onPress={onCancel}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    gap: 16,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#167044',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  choiceGroup: {
    gap: 8,
  },
  choiceChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    maxWidth: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  choiceChipActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#167044',
  },
  choiceChipText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  choiceChipTextActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  quantityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'flex-start',
  },
  quantityColumn: {
    flexBasis: 140,
    flexGrow: 1,
    flexShrink: 1,
  },
  helperNoteBox: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    padding: 10,
  },
  helperNoteText: {
    fontSize: 12,
    color: '#075985',
    fontWeight: '500',
  },
  actionGroup: {
    gap: 10,
    marginTop: 4,
    marginBottom: 20,
  },
});
