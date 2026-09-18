export interface LocationPoint {
  lat: number;
  lon: number;
  formatted: string;
  addressLine1?: string;
  addressLine2?: string;
  name?: string;
  street?: string;
  city?: string;
  country?: string;
  category?: string;
  resultType?: string;
  placeId?: string;
}

export interface RouteStep {
  instruction: string;
  distance: number; // in meters
  time: number; // in seconds
}

export interface RouteData {
  distanceMeters: number;
  timeSeconds: number;
  coordinates: [number, number][]; // [lat, lon] for Leaflet
  steps: RouteStep[];
}

export type UserRole = 'passenger' | 'rider';
export type RideStage = 'request' | 'navigation';

export type RideStatus =
  | 'idle'
  | 'requested'
  | 'accepted'
  | 'arrived_at_pickup'
  | 'in_transit'
  | 'completed'
  | 'declined'
  | 'cancelled';

export interface RideRequest {
  id: string; // e.g. RIDE-8392
  passengerId: string; // e.g. PAX-4821
  riderId?: string; // e.g. RIDER-9302
  pickup: LocationPoint;
  dropoff: LocationPoint;
  distanceKm: number;
  durationMinutes: number;
  fareTaka: number; // 1 km = 70 Taka
  status: RideStatus;
  createdAt: number;
  routeData?: RouteData;
  pickupRouteData?: RouteData; // route from rider to pickup
}
