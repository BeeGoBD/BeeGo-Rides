import { RideRequest, RideStatus, LocationPoint, RouteData } from '../types';

export const RATE_PER_KM_TAKA = 70;
const STORAGE_KEY = 'geoapify_active_ride';
const CHANNEL_NAME = 'geoapify_ride_broadcast';

type RideListener = (ride: RideRequest | null) => void;
const listeners = new Set<RideListener>();

let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      const updatedRide = event.data as RideRequest | null;
      notifyListeners(updatedRide);
    };
  } catch (e) {
    console.warn('BroadcastChannel not available, using storage events');
  }
}

// Storage event listener for cross-tab sync fallback
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      try {
        const parsed = e.newValue ? (JSON.parse(e.newValue) as RideRequest) : null;
        notifyListeners(parsed);
      } catch (err) {
        console.error('Error parsing storage ride update', err);
      }
    }
  });
}

function notifyListeners(ride: RideRequest | null) {
  listeners.forEach((listener) => {
    try {
      listener(ride);
    } catch (e) {
      console.error(e);
    }
  });
}

export function getStoredRide(): RideRequest | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RideRequest) : null;
  } catch {
    return null;
  }
}

export function saveAndBroadcastRide(ride: RideRequest | null) {
  if (typeof window !== 'undefined') {
    if (ride) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ride));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  if (broadcastChannel) {
    broadcastChannel.postMessage(ride);
  }

  notifyListeners(ride);
}

export function subscribeToRideUpdates(callback: RideListener): () => void {
  listeners.add(callback);
  // initial invoke with current state
  callback(getStoredRide());
  return () => {
    listeners.delete(callback);
  };
}

// ID generators
export function generatePassengerId(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PAX-${rand}`;
}

export function generateRiderId(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RIDER-${rand}`;
}

export function generateRideId(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RIDE-${rand}`;
}

/**
 * Passenger requests a new ride
 */
export function requestNewRide(
  passengerId: string,
  pickup: LocationPoint,
  dropoff: LocationPoint,
  routeData: RouteData
): RideRequest {
  const distanceKm = Math.max(0.1, Number((routeData.distanceMeters / 1000).toFixed(1)));
  const durationMinutes = Math.max(1, Math.round(routeData.timeSeconds / 60));
  const fareTaka = Math.round(distanceKm * RATE_PER_KM_TAKA);

  const newRide: RideRequest = {
    id: generateRideId(),
    passengerId,
    pickup,
    dropoff,
    distanceKm,
    durationMinutes,
    fareTaka,
    status: 'requested',
    createdAt: Date.now(),
    routeData,
  };

  saveAndBroadcastRide(newRide);
  return newRide;
}

/**
 * Rider accepts the ride
 */
export function acceptRide(riderId: string, pickupRouteData?: RouteData): RideRequest | null {
  const current = getStoredRide();
  if (!current) return null;

  const updated: RideRequest = {
    ...current,
    riderId,
    status: 'accepted',
    pickupRouteData: pickupRouteData || current.pickupRouteData,
  };

  saveAndBroadcastRide(updated);
  return updated;
}

/**
 * Rider arrives at the pickup spot
 */
export function arriveAtPickupSpot(): RideRequest | null {
  const current = getStoredRide();
  if (!current) return null;

  const updated: RideRequest = {
    ...current,
    status: 'arrived_at_pickup',
  };

  saveAndBroadcastRide(updated);
  return updated;
}

/**
 * Rider starts navigation from pickup to destination
 */
export function startTripToDestination(): RideRequest | null {
  const current = getStoredRide();
  if (!current) return null;

  const updated: RideRequest = {
    ...current,
    status: 'in_transit',
  };

  saveAndBroadcastRide(updated);
  return updated;
}

/**
 * Trip completes at destination
 */
export function completeTrip(): RideRequest | null {
  const current = getStoredRide();
  if (!current) return null;

  const updated: RideRequest = {
    ...current,
    status: 'completed',
  };

  saveAndBroadcastRide(updated);
  return updated;
}

/**
 * Rider declines the request
 */
export function declineRide(): void {
  const current = getStoredRide();
  if (!current) return;

  const updated: RideRequest = {
    ...current,
    status: 'declined',
  };

  saveAndBroadcastRide(updated);
}

/**
 * Passenger cancels request
 */
export function cancelRide(): void {
  const current = getStoredRide();
  if (!current) return;

  const updated: RideRequest = {
    ...current,
    status: 'cancelled',
  };

  saveAndBroadcastRide(updated);
}

/**
 * Reset / Dismiss ride
 */
export function clearCurrentRide(): void {
  saveAndBroadcastRide(null);
}
