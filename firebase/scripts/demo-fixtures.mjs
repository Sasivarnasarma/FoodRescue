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
