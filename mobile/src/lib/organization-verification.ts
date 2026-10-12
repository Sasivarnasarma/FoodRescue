export type AccountSnapshot = {
  data: { role?: unknown; accountStatus?: unknown } | null;
  confirmed: boolean;
};

export type ProfileSnapshot = {
  data: { type?: unknown; name?: unknown; verificationStatus?: unknown } | null;
  confirmed: boolean;
};

export function getOrganizationVerification(
  account: AccountSnapshot,
  profile: ProfileSnapshot,
) {
  const confirmed = account.confirmed && profile.confirmed;
  if (account.data?.role === 'provider' || profile.data?.type === 'provider') {
    return { state: 'other-role', confirmed } as const;
  }
  if (account.data?.accountStatus === 'suspended') {
    return { state: 'suspended', confirmed } as const;
  }
  if (
    account.data &&
    (account.data.role !== 'organization' ||
      account.data.accountStatus !== 'active')
  ) {
    return { state: 'invalid', confirmed } as const;
  }
  if (!profile.data) {
    return { state: confirmed ? 'form' : 'waiting', confirmed } as const;
  }
  if (!account.data && !confirmed) {
    return { state: 'waiting', confirmed } as const;
  }

  const { type, name, verificationStatus } = profile.data;
  if (
    !account.data ||
    type !== 'organization' ||
    typeof name !== 'string' ||
    !name.trim()
  ) {
    return { state: 'invalid', confirmed } as const;
  }
  switch (verificationStatus) {
    case 'pending':
    case 'approved':
    case 'rejected':
      return { state: verificationStatus, name, confirmed } as const;
    default:
      return { state: 'invalid', confirmed } as const;
  }
}
