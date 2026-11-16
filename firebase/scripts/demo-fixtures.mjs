export function donationFixtures(now = Date.now()) {
  return [
    {
      id: 'demo-urgent-near',
      title: 'DEMO bread donation',
      category: 'Bakery',
      latitude: 6.9271,
      longitude: 79.8612,
      starts: now - 60000,
      deadline: now + 45 * 60000,
      storage: 'ambient',
    },
    {
      id: 'demo-later-near',
      title: 'DEMO produce donation',
      category: 'Produce',
      latitude: 6.9281,
      longitude: 79.8622,
      starts: now + 30 * 60000,
      deadline: now + 180 * 60000,
      storage: 'ambient',
    },
    {
      id: 'demo-urgent-far',
      title: 'DEMO chilled donation',
      category: 'Dairy & Eggs',
      latitude: 7.01,
      longitude: 79.97,
      starts: now - 60000,
      deadline: now + 60 * 60000,
      storage: 'chilled',
    },
    {
      id: 'demo-expired',
      title: 'DEMO elapsed donation',
      category: 'Other',
      latitude: 6.9271,
      longitude: 79.8612,
      starts: now - 120 * 60000,
      deadline: now - 60 * 60000,
      storage: 'ambient',
    },
  ];
}

export function competingRequestFixtures(
  listingId = 'demo-urgent-near',
  deadlineMs = Date.now() + 45 * 60000,
  now = Date.now(),
) {
  return [
    {
      organizationUid: 'demo-competing-org-1',
      organizationName: 'Synthetic Hope Kitchen',
      listingId,
      providerUid: 'demo-donor',
      latitude: 6.9451,
      longitude: 79.8612,
      plannedPickupAt: deadlineMs - 15 * 60000,
      canMeetStorageRequirement: true,
      status: 'requested',
    },
    {
      organizationUid: 'demo-competing-org-2',
      organizationName: 'Synthetic Care Foundation',
      listingId,
      providerUid: 'demo-donor',
      latitude: 6.9631,
      longitude: 79.8612,
      plannedPickupAt: deadlineMs - 30 * 60000,
      canMeetStorageRequirement: true,
      status: 'requested',
    },
  ];
}

export function assignedDonationFixtures(now = Date.now()) {
  return [
    {
      listing: {
        id: 'demo-assigned-pickup',
        title: 'DEMO assigned sandwiches',
        category: 'Prepared Meals',
        description:
          'Synthetic demonstration food assigned for pickup testing.',
        quantity: 10,
        unit: 'portion',
        storage: 'chilled',
        storageInstructions: 'Keep chilled until handover',
        allergenDeclaration: 'provided',
        allergenInfo: 'Contains dairy and gluten',
        pickupAddress: 'Synthetic demonstration pickup location',
        latitude: 6.9271,
        longitude: 79.8612,
        starts: now - 15 * 60000,
        deadline: now + 90 * 60000,
        status: 'assigned',
        acceptedOrganizationUid: 'demo-organization',
      },
      request: {
        organizationUid: 'demo-organization',
        organizationName: 'Synthetic demo-organization',
        listingId: 'demo-assigned-pickup',
        providerUid: 'demo-donor',
        latitude: 6.931,
        longitude: 79.865,
        plannedPickupAt: now + 30 * 60000,
        canMeetStorageRequirement: true,
        status: 'approved',
      },
    },
    {
      listing: {
        id: 'demo-assigned-confirmed',
        title: 'DEMO confirmed bakery parcel',
        category: 'Bakery',
        description:
          'Synthetic demonstration food with recipient confirmation already recorded.',
        quantity: 8,
        unit: 'item',
        storage: 'ambient',
        storageInstructions: 'Store in ambient dry conditions',
        allergenDeclaration: 'provided',
        allergenInfo: 'Contains sesame and wheat',
        pickupAddress: 'Synthetic demonstration pickup location',
        latitude: 6.9271,
        longitude: 79.8612,
        starts: now - 10 * 60000,
        deadline: now + 60 * 60000,
        status: 'assigned',
        acceptedOrganizationUid: 'demo-organization',
      },
      request: {
        organizationUid: 'demo-organization',
        organizationName: 'Synthetic demo-organization',
        listingId: 'demo-assigned-confirmed',
        providerUid: 'demo-donor',
        latitude: 6.931,
        longitude: 79.865,
        plannedPickupAt: now + 20 * 60000,
        canMeetStorageRequirement: true,
        status: 'approved',
        // Confirmed 1 minute ago relative to execution; donor has 4 minutes to complete collection
        recipientConfirmedAt: now - 60000,
      },
    },
  ];
}
