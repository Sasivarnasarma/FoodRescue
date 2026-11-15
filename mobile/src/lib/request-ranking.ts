import type { Coordinates, FoodListing } from './listings';
import type { DonationRequest } from './requests';

export function calculateHaversineDistanceKm(
  from: Coordinates,
  to: Coordinates,
): number {
  const rad = (n: number) => (n * Math.PI) / 180;
  const a =
    Math.sin(rad(to.latitude - from.latitude) / 2) ** 2 +
    Math.cos(rad(from.latitude)) *
      Math.cos(rad(to.latitude)) *
      Math.sin(rad(to.longitude - from.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export const MAX_DISTANCE_KM = 10;
export const MAX_BUFFER_MINUTES = 30;
export const MIN_LEAD_TIME_MINUTES = 15;
export const WEIGHT_DISTANCE = 0.6;
export const WEIGHT_BUFFER = 0.4;

export interface RequestEligibility {
  isEligible: boolean;
  reasons: string[];
}

export interface ScoreBreakdown {
  distanceKm: number | null;
  distanceScore: number | null;
  bufferMinutes: number;
  bufferScore: number;
  totalScore: number | null;
  storageDeclared: boolean;
}

export interface RankingExplanation {
  summary: string;
  detailedLines: string[];
  factors: {
    distanceText: string;
    bufferText: string;
    storageText: string;
    scoreText: string;
  };
  disclaimer: string;
}

export interface RankedRequest {
  request: DonationRequest;
  eligibility: RequestEligibility;
  breakdown: ScoreBreakdown;
  explanation: RankingExplanation;
  rank?: number;
}

export interface ListingUrgency {
  remainingMinutes: number;
  urgencyLevel: 'expired' | 'critical' | 'urgent' | 'moderate' | 'relaxed';
  description: string;
}

export interface RankedRequestsResult {
  listingId: string;
  evaluatedAt: Date;
  urgency: ListingUrgency;
  rankedEligible: RankedRequest[];
  manualAssessment: RankedRequest[];
  ineligible: RankedRequest[];
  totalCount: number;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * Checks whether an incoming donation request is eligible for donor approval.
 * Enforces listing state, request status, affirmative storage declaration,
 * future pickup timing, pickup window boundaries, and the minimum 15-minute deadline cutoff.
 */
export function checkRequestEligibility(
  listing: FoodListing,
  request: DonationRequest,
  currentTime: Date = new Date(),
): RequestEligibility {
  const reasons: string[] = [];

  if (listing.status !== 'open') {
    reasons.push(
      `Listing is not open for requests (current listing status: ${listing.status}).`,
    );
  }

  if (request.status === 'withdrawn') {
    reasons.push('Request was withdrawn by the recipient organization.');
  } else if (request.status !== 'requested') {
    reasons.push(
      `Request is not pending approval (current request status: ${request.status}).`,
    );
  }

  if (!request.canMeetStorageRequirement) {
    reasons.push(
      `Organization has not confirmed capability to meet ${listing.storageRequirement} storage requirements.`,
    );
  }

  if (!listing.pickupDeadline) {
    reasons.push('Listing has no pickup deadline defined.');
  } else {
    const deadlineMs = listing.pickupDeadline.getTime();
    const plannedMs = request.plannedPickupAt.getTime();
    const currentMs = currentTime.getTime();

    if (plannedMs < currentMs) {
      reasons.push('Proposed pickup time is in the past.');
    }

    if (
      listing.pickupStartsAt &&
      plannedMs < listing.pickupStartsAt.getTime()
    ) {
      reasons.push('Proposed pickup time is before the pickup window opens.');
    }

    if (plannedMs > deadlineMs) {
      reasons.push('Proposed pickup time is after the pickup deadline.');
    }

    const bufferMinutes = (deadlineMs - plannedMs) / (60 * 1000);
    if (bufferMinutes < MIN_LEAD_TIME_MINUTES) {
      const displayMinutes = Math.max(0, Math.floor(bufferMinutes));
      reasons.push(
        `Proposed pickup leaves ${displayMinutes} minutes before the deadline; at least ${MIN_LEAD_TIME_MINUTES} minutes required.`,
      );
    }
  }

  return {
    isEligible: reasons.length === 0,
    reasons,
  };
}

/**
 * Calculates raw score components and the composite smart matching score.
 * Formula per docs/08_SMART_MATCHING_ENGINE.md:
 * - distanceScore = 100 * clamp(1 - distanceKm / 10, 0, 1)
 * - bufferScore = 100 * clamp(bufferMinutes / 30, 0, 1)
 * - score = 0.6 * distanceScore + 0.4 * bufferScore
 */
export function calculateRequestScore(
  listing: FoodListing,
  request: DonationRequest,
  currentTime: Date = new Date(),
): ScoreBreakdown {
  const storageDeclared = Boolean(request.canMeetStorageRequirement);

  let distanceKm: number | null = null;
  let distanceScore: number | null = null;

  if (
    request.departureLocation &&
    listing.pickupLocation &&
    isValidCoordinates(request.departureLocation) &&
    isValidCoordinates(listing.pickupLocation)
  ) {
    distanceKm = calculateHaversineDistanceKm(
      request.departureLocation,
      listing.pickupLocation,
    );
    distanceScore = 100 * clamp(1 - distanceKm / MAX_DISTANCE_KM, 0, 1);
  }

  let bufferMinutes = 0;
  if (listing.pickupDeadline) {
    bufferMinutes =
      (listing.pickupDeadline.getTime() - request.plannedPickupAt.getTime()) /
      (60 * 1000);
  }
  const bufferScore = 100 * clamp(bufferMinutes / MAX_BUFFER_MINUTES, 0, 1);

  let totalScore: number | null = null;
  if (distanceScore !== null) {
    const rawTotal =
      WEIGHT_DISTANCE * distanceScore + WEIGHT_BUFFER * bufferScore;
    totalScore = Number(rawTotal.toFixed(1));
  }

  return {
    distanceKm,
    distanceScore:
      distanceScore !== null ? Number(distanceScore.toFixed(1)) : null,
    bufferMinutes: Math.round(bufferMinutes * 10) / 10,
    bufferScore: Number(bufferScore.toFixed(1)),
    totalScore,
    storageDeclared,
  };
}

function isValidCoordinates(coords: Coordinates): boolean {
  return (
    Number.isFinite(coords.latitude) &&
    Number.isFinite(coords.longitude) &&
    Math.abs(coords.latitude) <= 90 &&
    Math.abs(coords.longitude) <= 180
  );
}

/**
 * Generates structured, human-readable explanations of a request's score and feasibility.
 */
export function generateRankingExplanation(
  request: DonationRequest,
  listing: FoodListing,
  eligibility: RequestEligibility,
  breakdown: ScoreBreakdown,
  rank?: number,
): RankingExplanation {
  const disclaimer =
    'Proposed pickup time is a commitment supplied by the organization, not an automated travel-time prediction.';

  if (!eligibility.isEligible) {
    const summary = `Ineligible: ${eligibility.reasons.join(' ')}`;
    return {
      summary,
      detailedLines: eligibility.reasons,
      factors: {
        distanceText:
          breakdown.distanceKm !== null
            ? `${breakdown.distanceKm.toFixed(1)} km straight-line distance`
            : 'Departure location not provided',
        bufferText: `${Math.round(breakdown.bufferMinutes)} minutes before deadline`,
        storageText: breakdown.storageDeclared
          ? `Storage compatibility declared (${listing.storageRequirement})`
          : `Storage requirement not met (needs ${listing.storageRequirement})`,
        scoreText: 'Ineligible — score not applicable',
      },
      disclaimer,
    };
  }

  const distanceText =
    breakdown.distanceKm !== null
      ? `${breakdown.distanceKm.toFixed(1)} km straight-line (Score: ${breakdown.distanceScore} / 100, 60% weight)`
      : 'Departure location not provided (manual assessment required)';

  const bufferText = `${Math.round(breakdown.bufferMinutes)} mins before deadline (Score: ${breakdown.bufferScore} / 100, 40% weight)`;

  const storageText = `Affirmed ${listing.storageRequirement} storage compatibility`;

  let scoreText: string;
  let summary: string;

  if (breakdown.totalScore !== null) {
    scoreText = `Total score: ${breakdown.totalScore.toFixed(1)} / 100`;
    summary = rank
      ? `Ranked #${rank} with score ${breakdown.totalScore.toFixed(1)} (${distanceText.split(' (')[0]}, ${bufferText.split(' (')[0]})`
      : `Score ${breakdown.totalScore.toFixed(1)} / 100`;
  } else {
    scoreText = `Buffer score: ${breakdown.bufferScore.toFixed(1)} / 100 (Distance unknown)`;
    summary = `Manual assessment needed: Distance unknown, pickup buffer ${Math.round(breakdown.bufferMinutes)}m (Buffer score: ${breakdown.bufferScore.toFixed(1)} / 100)`;
  }

  const detailedLines = [
    scoreText,
    `Distance: ${distanceText}`,
    `Pickup window buffer: ${bufferText}`,
    `Storage: ${storageText}`,
  ];

  return {
    summary,
    detailedLines,
    factors: {
      distanceText,
      bufferText,
      storageText,
      scoreText,
    },
    disclaimer,
  };
}

/**
 * Assesses listing urgency independently of request ranking (since deadline is shared).
 */
export function getListingUrgency(
  listing: FoodListing,
  currentTime: Date = new Date(),
): ListingUrgency {
  if (!listing.pickupDeadline) {
    return {
      remainingMinutes: 0,
      urgencyLevel: 'relaxed',
      description: 'No pickup deadline set.',
    };
  }

  const remainingMs = listing.pickupDeadline.getTime() - currentTime.getTime();
  const remainingMinutes = Math.floor(remainingMs / (60 * 1000));

  if (remainingMinutes <= 0) {
    return {
      remainingMinutes: 0,
      urgencyLevel: 'expired',
      description: 'Pickup deadline has elapsed.',
    };
  }

  if (remainingMinutes < 30) {
    return {
      remainingMinutes,
      urgencyLevel: 'critical',
      description: `Critical: Only ${remainingMinutes} minutes remaining before deadline.`,
    };
  }

  if (remainingMinutes < 60) {
    return {
      remainingMinutes,
      urgencyLevel: 'urgent',
      description: `Urgent: ${remainingMinutes} minutes remaining before deadline.`,
    };
  }

  if (remainingMinutes < 180) {
    return {
      remainingMinutes,
      urgencyLevel: 'moderate',
      description: `Moderate: ${Math.round(remainingMinutes / 60)} hours remaining until deadline.`,
    };
  }

  return {
    remainingMinutes,
    urgencyLevel: 'relaxed',
    description: `Relaxed: ${Math.round(remainingMinutes / 60)} hours remaining until deadline.`,
  };
}

/**
 * Evaluates, scores, and ranks a set of incoming requests for a listing.
 * Categorizes requests into:
 * - rankedEligible: requests with coordinates, fully eligible, sorted deterministically by score, pickup time, organizationUid
 * - manualAssessment: requests missing coordinates, but otherwise eligible, for manual donor review
 * - ineligible: requests that violate eligibility criteria (stale time, storage incompatibility, withdrawn, etc.)
 */
export function rankListingRequests(
  listing: FoodListing,
  requests: DonationRequest[],
  currentTime: Date = new Date(),
): RankedRequestsResult {
  const urgency = getListingUrgency(listing, currentTime);

  const evaluated: RankedRequest[] = requests.map((request) => {
    const eligibility = checkRequestEligibility(listing, request, currentTime);
    const breakdown = calculateRequestScore(listing, request, currentTime);
    const explanation = generateRankingExplanation(
      request,
      listing,
      eligibility,
      breakdown,
    );
    return {
      request,
      eligibility,
      breakdown,
      explanation,
    };
  });

  const ineligible: RankedRequest[] = [];
  const manualAssessment: RankedRequest[] = [];
  const candidateEligible: RankedRequest[] = [];

  for (const item of evaluated) {
    if (!item.eligibility.isEligible) {
      ineligible.push(item);
    } else if (item.breakdown.totalScore === null) {
      manualAssessment.push(item);
    } else {
      candidateEligible.push(item);
    }
  }

  // Deterministic sorting for scored eligible requests:
  // 1. Higher totalScore first (descending)
  // 2. Earlier proposed pickup time first (ascending)
  // 3. Organization UID alphabetical for final tie-breaking
  candidateEligible.sort((a, b) => {
    const scoreDiff =
      (b.breakdown.totalScore ?? 0) - (a.breakdown.totalScore ?? 0);
    if (Math.abs(scoreDiff) > 0.001) {
      return scoreDiff;
    }

    const timeDiff =
      a.request.plannedPickupAt.getTime() - b.request.plannedPickupAt.getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return a.request.organizationUid.localeCompare(b.request.organizationUid);
  });

  // Assign 1-based ranks and update summaries
  candidateEligible.forEach((item, index) => {
    item.rank = index + 1;
    item.explanation = generateRankingExplanation(
      item.request,
      listing,
      item.eligibility,
      item.breakdown,
      item.rank,
    );
  });

  // Sort manual assessment requests by bufferScore descending, then plannedPickupAt ascending
  manualAssessment.sort((a, b) => {
    const bufferDiff = b.breakdown.bufferScore - a.breakdown.bufferScore;
    if (Math.abs(bufferDiff) > 0.001) {
      return bufferDiff;
    }
    const timeDiff =
      a.request.plannedPickupAt.getTime() - b.request.plannedPickupAt.getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return a.request.organizationUid.localeCompare(b.request.organizationUid);
  });

  return {
    listingId: listing.id,
    evaluatedAt: currentTime,
    urgency,
    rankedEligible: candidateEligible,
    manualAssessment,
    ineligible,
    totalCount: requests.length,
  };
}

/**
 * Compares two requests and generates a natural-language explanation of why
 * one is ranked higher than the other.
 */
export function explainRankingComparison(
  first: RankedRequest,
  second: RankedRequest,
): string {
  if (!first || !second) {
    return 'Comparison unavailable.';
  }

  if (!first.eligibility.isEligible && second.eligibility.isEligible) {
    return `${second.request.organizationName || second.request.organizationUid} is eligible, whereas ${first.request.organizationName || first.request.organizationUid} is ineligible (${first.eligibility.reasons[0]}).`;
  }
  if (first.eligibility.isEligible && !second.eligibility.isEligible) {
    return `${first.request.organizationName || first.request.organizationUid} is eligible, whereas ${second.request.organizationName || second.request.organizationUid} is ineligible (${second.eligibility.reasons[0]}).`;
  }
  if (!first.eligibility.isEligible && !second.eligibility.isEligible) {
    return 'Both requests are ineligible for donor approval.';
  }

  // If one has missing coordinates
  if (
    first.breakdown.totalScore !== null &&
    second.breakdown.totalScore === null
  ) {
    return `${first.request.organizationName || first.request.organizationUid} has verified departure coordinates and a total score of ${first.breakdown.totalScore}, while ${second.request.organizationName || second.request.organizationUid} did not provide coordinates and requires manual assessment.`;
  }
  if (
    first.breakdown.totalScore === null &&
    second.breakdown.totalScore !== null
  ) {
    return `${second.request.organizationName || second.request.organizationUid} has verified departure coordinates and a total score of ${second.breakdown.totalScore}, while ${first.request.organizationName || first.request.organizationUid} requires manual assessment.`;
  }

  const scoreA = first.breakdown.totalScore ?? 0;
  const scoreB = second.breakdown.totalScore ?? 0;
  const nameA = first.request.organizationName || first.request.organizationUid;
  const nameB =
    second.request.organizationName || second.request.organizationUid;

  if (Math.abs(scoreA - scoreB) > 0.001) {
    const higher = scoreA > scoreB ? first : second;
    const lower = scoreA > scoreB ? second : first;
    const higherName =
      higher.request.organizationName || higher.request.organizationUid;
    const lowerName =
      lower.request.organizationName || lower.request.organizationUid;

    const distHigher = higher.breakdown.distanceKm ?? 0;
    const distLower = lower.breakdown.distanceKm ?? 0;
    const bufferHigher = higher.breakdown.bufferMinutes;
    const bufferLower = lower.breakdown.bufferMinutes;

    if (distHigher > distLower && bufferHigher > bufferLower) {
      return `${higherName} ranks higher (score ${higher.breakdown.totalScore} vs ${lower.breakdown.totalScore}) because its proposed pickup leaves ${Math.round(bufferHigher - bufferLower)} more minutes before the deadline, outweighing ${lowerName}'s closer location.`;
    }
    if (distHigher < distLower && bufferHigher < bufferLower) {
      return `${higherName} ranks higher (score ${higher.breakdown.totalScore} vs ${lower.breakdown.totalScore}) because it is closer (${distHigher.toFixed(1)} km vs ${distLower.toFixed(1)} km), which outweighs the pickup buffer difference.`;
    }
    if (distHigher <= distLower && bufferHigher >= bufferLower) {
      return `${higherName} ranks higher (score ${higher.breakdown.totalScore} vs ${lower.breakdown.totalScore}) because it is both closer and proposes earlier pickup.`;
    }
    return `${higherName} ranks higher with a composite score of ${higher.breakdown.totalScore} vs ${lower.breakdown.totalScore}.`;
  }

  // Scores are tied: compare pickup times
  const timeA = first.request.plannedPickupAt.getTime();
  const timeB = second.request.plannedPickupAt.getTime();
  if (timeA !== timeB) {
    const earlier = timeA < timeB ? nameA : nameB;
    const later = timeA < timeB ? nameB : nameA;
    return `Scores are tied (${scoreA}); ${earlier} ranks higher due to proposing an earlier pickup time than ${later}.`;
  }

  // Organization UID tie-break
  return `Scores and proposed pickup times are identical; ${nameA} ranks ahead alphabetically by organization ID.`;
}
