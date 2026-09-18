import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Car,
  MapPin,
  Navigation,
  CheckCircle2,
  XCircle,
  Clock,
  Banknote,
  Compass,
  ArrowLeft,
  RefreshCw,
  Milestone,
  Check,
  Radio,
} from 'lucide-react';
import { LocationPoint, RideRequest, RouteData } from '../types';
import {
  acceptRide,
  arriveAtPickupSpot,
  startTripToDestination,
  completeTrip,
  declineRide,
  clearCurrentRide,
  RATE_PER_KM_TAKA,
} from '../services/rideSync';
import { calculateRoute, DEFAULT_GEOAPIFY_KEY } from '../services/geoapify';

interface RiderDashboardProps {
  riderId: string;
  activeRide: RideRequest | null;
  apiKey: string;
  onBackToRoles: () => void;
  onSwitchToPassenger: () => void;
}

export const RiderDashboard: React.FC<RiderDashboardProps> = ({
  riderId,
  activeRide,
  apiKey,
  onBackToRoles,
  onSwitchToPassenger,
}) => {
  const activeKey = apiKey.trim() || DEFAULT_GEOAPIFY_KEY;

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [isAccepting, setIsAccepting] = useState(false);
  const [isArriving, setIsArriving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Initialize and update Map based on ride status
  useEffect(() => {
    // Only show map if ride is accepted, arrived, in_transit, or completed
    if (
      !activeRide ||
      activeRide.status === 'requested' ||
      activeRide.status === 'declined' ||
      activeRide.status === 'cancelled'
    ) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const centerLat = activeRide.pickup.lat;
      const centerLon = activeRide.pickup.lon;

      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLon],
        zoom: 14,
        zoomControl: false,
      });

      L.control.zoom({ position: 'topright' }).addTo(map);

      // Geoapify Dark tiles
      const tileUrl = activeKey
        ? `https://maps.geoapify.com/v1/tile/dark-matter-purple-roads/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(
            activeKey
          )}`
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

      L.tileLayer(tileUrl, {
        attribution: '&copy; Geoapify | &copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const markers = markersLayerRef.current;
    if (!map || !markers) return;

    markers.clearLayers();
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    // STAGE 1: Rider Accepted -> Show Where is the Pickup Spot
    if (activeRide.status === 'accepted') {
      const pickupIcon = L.divIcon({
        className: 'custom-rider-pickup-pin',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center;">
            <span style="position: absolute; width: 34px; height: 34px; border-radius: 9999px; background: rgba(16, 185, 129, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
            <div style="width: 20px; height: 20px; border-radius: 9999px; background: #10b981; border: 3px solid #ffffff; box-shadow: 0 0 14px rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center;">
            </div>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const pickupMarker = L.marker([activeRide.pickup.lat, activeRide.pickup.lon], {
        icon: pickupIcon,
      }).addTo(markers);

      pickupMarker
        .bindPopup(
          `<div style="font-family: sans-serif; font-size: 12px; color: #111;">
            <strong>Pickup Spot</strong><br/>${activeRide.pickup.formatted}
          </div>`
        )
        .openPopup();

      map.setView([activeRide.pickup.lat, activeRide.pickup.lon], 15);
    }

    // STAGE 2: Arrived at Pickup Spot / In Transit / Completed -> Reveal Drop-off (Where to go) & Full Route
    if (
      activeRide.status === 'arrived_at_pickup' ||
      activeRide.status === 'in_transit' ||
      activeRide.status === 'completed'
    ) {
      // Pickup marker
      const pickupIcon = L.divIcon({
        className: 'custom-pax-pickup',
        html: `
          <div style="width: 18px; height: 18px; border-radius: 9999px; background: #10b981; border: 3px solid #ffffff; box-shadow: 0 0 10px rgba(0,0,0,0.8);"></div>
        `,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      // Dropoff marker (Where to go!)
      const dropoffIcon = L.divIcon({
        className: 'custom-pax-dropoff',
        html: `
          <div style="width: 20px; height: 20px; border-radius: 4px; background: #ef4444; border: 3px solid #ffffff; box-shadow: 0 0 12px rgba(0,0,0,0.9); transform: rotate(45deg);"></div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      L.marker([activeRide.pickup.lat, activeRide.pickup.lon], { icon: pickupIcon })
        .bindPopup(`<strong>Pickup:</strong> ${activeRide.pickup.formatted}`)
        .addTo(markers);

      L.marker([activeRide.dropoff.lat, activeRide.dropoff.lon], { icon: dropoffIcon })
        .bindPopup(`<strong>Where to go (Drop-off):</strong> ${activeRide.dropoff.formatted}`)
        .addTo(markers)
        .openPopup();

      // Draw polyline if route data exists
      if (activeRide.routeData?.coordinates && activeRide.routeData.coordinates.length > 0) {
        const polyline = L.polyline(activeRide.routeData.coordinates, {
          color: '#3b82f6',
          weight: 6,
          opacity: 0.9,
          lineJoin: 'round',
        }).addTo(map);

        routeLayerRef.current = polyline;
        map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
      } else {
        const bounds = L.latLngBounds([
          [activeRide.pickup.lat, activeRide.pickup.lon],
          [activeRide.dropoff.lat, activeRide.dropoff.lon],
        ]);
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [activeRide?.status, activeRide?.id, activeKey]);

  // Handle Accept
  const handleAccept = async () => {
    if (!activeRide) return;
    setIsAccepting(true);
    setActionError(null);
    try {
      acceptRide(riderId);
    } catch (err: any) {
      setActionError(err.message || 'Failed to accept ride.');
    } finally {
      setIsAccepting(false);
    }
  };

  // Handle Arrive at Pickup Spot
  const handleArriveAtPickup = () => {
    if (!activeRide) return;
    setIsArriving(true);
    try {
      arriveAtPickupSpot();
    } catch (err: any) {
      setActionError(err.message || 'Failed to confirm arrival at pickup spot.');
    } finally {
      setIsArriving(false);
    }
  };

  // Handle Start Trip to destination
  const handleStartTrip = () => {
    startTripToDestination();
  };

  // Handle Complete Trip
  const handleCompleteTrip = () => {
    completeTrip();
  };

  // Handle Dismiss / Reset
  const handleReset = () => {
    clearCurrentRide();
  };

  const hasIncomingRequest = activeRide && activeRide.status === 'requested';
  const isTripActive =
    activeRide &&
    (activeRide.status === 'accepted' ||
      activeRide.status === 'arrived_at_pickup' ||
      activeRide.status === 'in_transit');

  return (
    <div id="rider-dashboard" className="w-full min-h-screen bg-black text-white flex flex-col">
      {/* Top Rider Navigation Bar */}
      <header className="w-full border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur px-4 py-3 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToRoles}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-2.5 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Roles</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-sm font-bold text-white tracking-wide">Rider Dashboard</h1>
          </div>

          <span className="font-mono text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded">
            {riderId}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSwitchToPassenger}
            className="text-xs bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 px-3 py-1.5 rounded-lg transition-colors cursor-pointer font-medium"
            title="Switch to passenger in this view"
          >
            Switch to Passenger
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
        {/* Left Side: Controls & Ride Request Details Panel */}
        <div className="w-full md:w-96 lg:w-[420px] bg-zinc-950 border-r border-zinc-800/80 p-5 flex flex-col justify-between overflow-y-auto z-10">
          <div>
            {/* Status Badge */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs uppercase font-bold tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                Live Dispatch Feed
              </span>
              <span className="text-[11px] font-mono text-zinc-400">Rate: ৳{RATE_PER_KM_TAKA}/km</span>
            </div>

            {actionError && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl">
                {actionError}
              </div>
            )}

            {/* STATE 1: NO ACTIVE RIDE -> WAITING RADAR */}
            {!activeRide || activeRide.status === 'declined' || activeRide.status === 'cancelled' ? (
              <div className="py-12 px-4 text-center">
                <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-emerald-500/20 animate-ping" />
                  <div className="absolute inset-2 rounded-full border border-emerald-500/40 animate-pulse" />
                  <div className="w-12 h-12 rounded-full bg-zinc-900 border border-emerald-500/60 flex items-center justify-center text-emerald-400">
                    <Car className="w-6 h-6" />
                  </div>
                </div>

                <h3 className="text-base font-bold text-white mb-1.5">
                  {activeRide?.status === 'declined'
                    ? 'Ride Declined'
                    : activeRide?.status === 'cancelled'
                    ? 'Ride Cancelled by Passenger'
                    : 'Online & Ready'}
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed max-w-xs mx-auto mb-6">
                  {activeRide?.status === 'declined' || activeRide?.status === 'cancelled'
                    ? 'Listening for new incoming ride requests from passengers...'
                    : 'Listening for live ride requests from guest passengers...'}
                </p>

                <div className="p-3 bg-black/60 border border-zinc-800/80 rounded-xl text-left text-xs text-zinc-400 space-y-2">
                  <div className="flex items-center justify-between text-zinc-300">
                    <span>Pricing Standard:</span>
                    <span className="font-bold text-white">৳70 Taka per km</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-300">
                    <span>Your Rider ID:</span>
                    <span className="font-mono text-emerald-400">{riderId}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-800">
                    When a passenger requests a ride, the price in Taka will appear here instantly for you to accept or decline.
                  </p>
                </div>
              </div>
            ) : null}

            {/* STATE 2: INCOMING REQUEST (BEFORE ACCEPTING) */}
            {/* User specification: "Before that, he can only see the price, which is right now 1 kilometer is equal to 70 taka. So you can count that according that." */}
            {hasIncomingRequest && (
              <div
                id="incoming-ride-request-card"
                className="p-5 rounded-2xl bg-zinc-900/90 border-2 border-emerald-500/80 shadow-2xl animate-in fade-in"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                    New Ride Request!
                  </span>
                  <span className="text-xs text-zinc-400 font-mono">
                    {activeRide.passengerId}
                  </span>
                </div>

                {/* THE PRICE (HIGHLIGHTED BEFORE ACCEPTING) */}
                <div className="my-5 p-4 rounded-xl bg-black border border-zinc-800 text-center">
                  <div className="text-xs text-zinc-400 uppercase tracking-wider font-medium mb-1">
                    Trip Fare Price
                  </div>
                  <div className="text-3xl font-extrabold text-emerald-400 tracking-tight flex items-center justify-center gap-1.5">
                    <Banknote className="w-7 h-7 text-emerald-400" />
                    <span>৳{activeRide.fareTaka} Taka</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-1">
                    Distance: <strong className="text-zinc-200">{activeRide.distanceKm} km</strong> • (70 Taka/km)
                  </div>
                </div>

                <div className="text-xs text-zinc-400 text-center mb-5">
                  Accept to view where the pickup spot is located.
                </div>

                {/* ACCEPT / DECLINE BUTTONS */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    id="decline-ride-button"
                    type="button"
                    onClick={() => declineRide()}
                    className="py-3 px-4 rounded-xl font-bold text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span>Decline</span>
                  </button>

                  <button
                    id="accept-ride-button"
                    type="button"
                    onClick={handleAccept}
                    disabled={isAccepting}
                    className="py-3 px-4 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4 text-black" />
                    <span>{isAccepting ? 'Accepting...' : 'Accept Ride'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* STATE 3: ACCEPTED -> SHOW WHERE IS THE PICKUP SPOT & "I HAVE ARRIVED AT THE PICKUP SPOT" */}
            {activeRide?.status === 'accepted' && (
              <div id="accepted-pickup-panel" className="space-y-4 animate-in fade-in">
                <div className="p-4 rounded-xl bg-zinc-900 border border-emerald-500/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-400">
                      Step 1: Go to Pickup Spot
                    </span>
                    <span className="text-xs font-bold text-white">৳{activeRide.fareTaka} Taka</span>
                  </div>

                  <div className="mt-3 p-3 bg-black rounded-lg border border-zinc-800">
                    <div className="text-[11px] text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Pickup Spot Location:</span>
                    </div>
                    <div className="text-sm font-semibold text-white">
                      {activeRide.pickup.addressLine1 || activeRide.pickup.formatted.split(',')[0]}
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      {activeRide.pickup.addressLine2 || activeRide.pickup.formatted}
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400 mt-3 leading-relaxed">
                    Navigate to the pickup spot shown on the map. Once you reach the passenger, click the button below.
                  </p>
                </div>

                {/* THE "I HAVE ARRIVED AT THE PICKUP SPOT" BUTTON */}
                <button
                  id="arrived-at-pickup-button"
                  type="button"
                  onClick={handleArriveAtPickup}
                  disabled={isArriving}
                  className="w-full py-4 px-5 rounded-xl font-bold text-sm bg-white hover:bg-zinc-200 text-black shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5 text-emerald-600" />
                  <span>I have arrived at the pickup spot</span>
                </button>
              </div>
            )}

            {/* STATE 4: ARRIVED AT PICKUP -> "THEN HE WILL SEE WHERE TO GO" */}
            {activeRide?.status === 'arrived_at_pickup' && (
              <div id="arrived-panel" className="space-y-4 animate-in fade-in">
                <div className="p-4 rounded-xl bg-zinc-900 border border-blue-500/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-sky-400">
                      Step 2: Where to Go (Destination)
                    </span>
                    <span className="text-xs font-bold text-white">৳{activeRide.fareTaka} Taka</span>
                  </div>

                  <div className="mt-3 p-3 bg-black rounded-lg border border-zinc-800">
                    <div className="text-[11px] text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Navigation className="w-3.5 h-3.5 text-red-400" />
                      <span>Drop-off Spot (Where to go):</span>
                    </div>
                    <div className="text-sm font-semibold text-white">
                      {activeRide.dropoff.addressLine1 || activeRide.dropoff.formatted.split(',')[0]}
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      {activeRide.dropoff.addressLine2 || activeRide.dropoff.formatted}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                    <span>Trip Distance: {activeRide.distanceKm} km</span>
                    <span>Est. Time: {activeRide.durationMinutes} mins</span>
                  </div>
                </div>

                <button
                  id="start-transit-button"
                  type="button"
                  onClick={handleStartTrip}
                  className="w-full py-4 px-5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-500 text-white shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Navigation className="w-5 h-5 text-white" />
                  <span>Start Navigation to Destination</span>
                </button>
              </div>
            )}

            {/* STATE 5: IN TRANSIT */}
            {activeRide?.status === 'in_transit' && (
              <div id="transit-panel" className="space-y-4 animate-in fade-in">
                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      Trip In Progress
                    </span>
                    <span className="text-xs font-bold text-emerald-400">৳{activeRide.fareTaka} Taka</span>
                  </div>

                  <div className="p-3 bg-black rounded-lg border border-zinc-800 text-xs">
                    <div className="text-zinc-400">Navigating to Drop-off Spot:</div>
                    <div className="text-white font-semibold mt-1 truncate">
                      {activeRide.dropoff.formatted}
                    </div>
                  </div>
                </div>

                <button
                  id="complete-trip-button"
                  type="button"
                  onClick={handleCompleteTrip}
                  className="w-full py-4 px-5 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-black shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Complete Trip (Collect ৳{activeRide.fareTaka} Taka)</span>
                </button>
              </div>
            )}

            {/* STATE 6: COMPLETED */}
            {activeRide?.status === 'completed' && (
              <div id="completed-panel" className="p-5 rounded-2xl bg-zinc-900 border border-emerald-500/60 text-center animate-in fade-in">
                <div className="w-12 h-12 rounded-full bg-emerald-500 text-black flex items-center justify-center mx-auto mb-3">
                  <Check className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-extrabold text-white mb-1">Trip Completed!</h3>
                <p className="text-xs text-zinc-400 mb-4">Passenger safely dropped off at destination.</p>

                <div className="p-4 rounded-xl bg-black border border-zinc-800 mb-5">
                  <div className="text-xs text-zinc-400 uppercase tracking-wider">Fare Collected</div>
                  <div className="text-3xl font-extrabold text-emerald-400 mt-1">
                    ৳{activeRide.fareTaka} Taka
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Total distance: {activeRide.distanceKm} km (৳70/km)
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-white text-black hover:bg-zinc-200 transition-colors cursor-pointer"
                >
                  Ready for Next Ride
                </button>
              </div>
            )}
          </div>

          {/* Footer Info */}
          <div className="pt-4 mt-6 border-t border-zinc-900 text-[11px] text-zinc-500 flex items-center justify-between">
            <span>Rider: {riderId}</span>
            <span>Live Geoapify Routing</span>
          </div>
        </div>

        {/* Right Side: Map Display */}
        <div className="flex-1 bg-black relative min-h-[380px] md:min-h-full">
          {isTripActive || activeRide?.status === 'completed' ? (
            <div ref={mapContainerRef} className="w-full h-full min-h-[420px]" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-zinc-600">
              <div className="w-16 h-16 rounded-2xl border border-zinc-800 bg-zinc-950 flex items-center justify-center text-zinc-700 mb-3">
                <Compass className="w-8 h-8" />
              </div>
              <div className="text-sm font-semibold text-zinc-500">Navigation Map Standby</div>
              <div className="text-xs text-zinc-600 max-w-xs mt-1">
                The map will activate when you accept a ride request to guide you to the pickup spot.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
