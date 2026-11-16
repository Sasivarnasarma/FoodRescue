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
