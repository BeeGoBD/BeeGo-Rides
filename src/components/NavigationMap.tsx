import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  ArrowLeft,
  Navigation,
  MapPin,
  Clock,
  Milestone,
  Play,
  Pause,
  RotateCcw,
  CheckCircle,
  Zap,
} from 'lucide-react';
import { LocationPoint, RouteData } from '../types';
import { DEFAULT_GEOAPIFY_KEY } from '../services/geoapify';

interface NavigationMapProps {
  pickup: LocationPoint;
  dropoff: LocationPoint;
  routeData: RouteData;
  apiKey: string;
  fareTaka?: number;
  passengerId?: string;
  riderId?: string;
  onBackToRequest: () => void;
}

export const NavigationMap: React.FC<NavigationMapProps> = ({
  pickup,
  dropoff,
  routeData,
  apiKey,
  fareTaka,
  passengerId,
  riderId,
  onBackToRequest,
}) => {
  const activeKey = apiKey.trim() || DEFAULT_GEOAPIFY_KEY;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const vehicleMarkerRef = useRef<L.Marker | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [isNavigating, setIsNavigating] = useState(true);
  const [currentCoordIndex, setCurrentCoordIndex] = useState(0);
  const [tripCompleted, setTripCompleted] = useState(false);

  // Formatting helpers
  const distanceKm = (routeData.distanceMeters / 1000).toFixed(1);
  const distanceMiles = (routeData.distanceMeters * 0.000621371).toFixed(1);
  const durationMinutes = Math.max(1, Math.round(routeData.timeSeconds / 60));
  const finalFare = fareTaka || Math.round(Number(distanceKm) * 70);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Cleanup previous map if any
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const defaultCenter: [number, number] = [pickup.lat, pickup.lon];
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 14,
      zoomControl: false,
    });

    // Add zoom control top right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Tiles: Geoapify dark matter purple roads tiles with activeKey
    const tileUrl = activeKey
      ? `https://maps.geoapify.com/v1/tile/dark-matter-purple-roads/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(
          activeKey
        )}`
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    L.tileLayer(tileUrl, {
      attribution:
        '&copy; <a href="https://www.geoapify.com/" target="_blank">Geoapify</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Pickup Icon
    const pickupIcon = L.divIcon({
      className: 'custom-pickup-marker',
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          <span style="position: absolute; width: 28px; height: 28px; border-radius: 9999px; background: rgba(16, 185, 129, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
          <div style="width: 16px; height: 16px; border-radius: 9999px; background: #10b981; border: 3px solid #ffffff; box-shadow: 0 0 10px rgba(0,0,0,0.8);"></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    // Dropoff Icon
    const dropoffIcon = L.divIcon({
      className: 'custom-dropoff-marker',
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          <div style="width: 18px; height: 18px; border-radius: 4px; background: #ef4444; border: 3px solid #ffffff; box-shadow: 0 0 10px rgba(0,0,0,0.8); transform: rotate(45deg);"></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    // Vehicle Marker Icon
    const vehicleIcon = L.divIcon({
      className: 'custom-vehicle-marker',
      html: `
        <div style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; background: #ffffff; color: #000000; border-radius: 9999px; box-shadow: 0 4px 14px rgba(0,0,0,0.7); border: 2px solid #10b981;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11"/>
          </svg>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    // Add Pickup & Dropoff Markers
    const pickupMarker = L.marker([pickup.lat, pickup.lon], { icon: pickupIcon })
      .addTo(map)
      .bindPopup(
        `<div style="color: #000; font-size: 12px; font-weight: bold;">Pickup Spot</div><div style="color: #555; font-size: 11px;">${pickup.formatted}</div>`
      );

    const dropoffMarker = L.marker([dropoff.lat, dropoff.lon], { icon: dropoffIcon })
      .addTo(map)
      .bindPopup(
        `<div style="color: #000; font-size: 12px; font-weight: bold;">Drop-off Spot</div><div style="color: #555; font-size: 11px;">${dropoff.formatted}</div>`
      );

    // Draw Route Polyline from Geoapify
    if (routeData.coordinates.length > 0) {
      // Glow/Border line underneath
      L.polyline(routeData.coordinates, {
        color: '#000000',
        weight: 8,
        opacity: 0.9,
      }).addTo(map);

      // Main Navigation Line (Uber-style cyan/emerald)
      const routePolyline = L.polyline(routeData.coordinates, {
        color: '#10b981',
        weight: 5,
        opacity: 0.95,
        lineJoin: 'round',
      }).addTo(map);

      // Fit map to route bounds
      map.fitBounds(routePolyline.getBounds(), {
        padding: [60, 60],
        maxZoom: 16,
      });

      // Add vehicle marker at the start
      const startCoord = routeData.coordinates[0];
      const vehicleMarker = L.marker(startCoord, {
        icon: vehicleIcon,
        zIndexOffset: 1000,
      }).addTo(map);
      vehicleMarkerRef.current = vehicleMarker;
    }

    mapInstanceRef.current = map;

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [pickup, dropoff, routeData, apiKey]);

  // Real-time Vehicle Tracking Animation along Geoapify Route Coordinates
  useEffect(() => {
    if (!isNavigating || tripCompleted || routeData.coordinates.length === 0) return;

    let index = currentCoordIndex;
    let lastTime = performance.now();
    const intervalMs = Math.max(120, Math.min(600, 20000 / routeData.coordinates.length));

    const step = (time: number) => {
      if (time - lastTime > intervalMs) {
        lastTime = time;
        if (index < routeData.coordinates.length - 1) {
          index += 1;
          setCurrentCoordIndex(index);
          const nextCoord = routeData.coordinates[index];

          if (vehicleMarkerRef.current) {
            vehicleMarkerRef.current.setLatLng(nextCoord);
          }
        } else {
          setTripCompleted(true);
          setIsNavigating(false);
          return;
        }
      }
      animFrameRef.current = requestAnimationFrame(step);
    };

    animFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isNavigating, tripCompleted, currentCoordIndex, routeData.coordinates]);

  const handleResetTrip = () => {
    setCurrentCoordIndex(0);
    setTripCompleted(false);
    setIsNavigating(true);
    if (vehicleMarkerRef.current && routeData.coordinates.length > 0) {
      vehicleMarkerRef.current.setLatLng(routeData.coordinates[0]);
    }
  };

  // Calculate remaining progress
  const progressPercent = routeData.coordinates.length > 0
    ? Math.round((currentCoordIndex / (routeData.coordinates.length - 1)) * 100)
    : 0;

  // Current turn instruction
  const currentStep = routeData.steps[Math.min(
    routeData.steps.length - 1,
    Math.floor((currentCoordIndex / Math.max(1, routeData.coordinates.length)) * routeData.steps.length)
  )] || routeData.steps[0];

  return (
    <div id="navigation-map-view" className="relative w-full h-screen bg-black overflow-hidden flex flex-col">
      {/* Top Floating Navigation Bar */}
      <header className="absolute top-4 left-4 right-4 z-[1000] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pointer-events-none">
        {/* Back / Edit Button */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            id="back-to-request-button"
            type="button"
            onClick={onBackToRequest}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-950/90 hover:bg-zinc-900 border border-zinc-800 text-white rounded-xl shadow-2xl backdrop-blur-md text-xs font-semibold transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Edit Spots</span>
          </button>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-2.5 bg-zinc-950/90 border border-zinc-800 rounded-xl text-xs text-zinc-300 backdrop-blur-md">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Geoapify Route Optimized</span>
          </div>
        </div>

        {/* Turn-by-Turn Instruction Banner */}
        {currentStep && (
          <div className="pointer-events-auto bg-zinc-950/95 border border-zinc-800 rounded-xl px-4 py-2.5 text-white shadow-2xl backdrop-blur-md flex items-center gap-3 max-w-md">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Navigation className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {tripCompleted ? 'You have arrived at your destination!' : currentStep.instruction}
              </div>
              <div className="text-[11px] text-zinc-400 flex items-center gap-2">
                <span>{tripCompleted ? 'Trip Complete' : `Next action`}</span>
                <span>•</span>
                <span>{progressPercent}% navigated</span>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Leaflet Map Container */}
      <div
        id="leaflet-map-container"
        ref={mapContainerRef}
        className="w-full h-full flex-1 z-0"
        style={{ minHeight: '350px' }}
      />

      {/* Bottom Floating Navigation HUD */}
      <div className="absolute bottom-4 left-4 right-4 z-[1000] pointer-events-none max-w-2xl mx-auto">
        <div className="pointer-events-auto bg-zinc-950/95 border border-zinc-800 rounded-2xl p-4 shadow-2xl backdrop-blur-md">
          {/* Progress Bar */}
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mb-4">
            <div
              className="bg-emerald-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center mb-4">
            {/* Pickup & Destination Summary */}
            <div className="sm:col-span-2 space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 text-xs text-zinc-300 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                <span className="font-semibold text-zinc-400 shrink-0">From:</span>
                <span className="truncate">{pickup.formatted}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-white truncate">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
                <span className="font-semibold text-zinc-400 shrink-0">To:</span>
                <span className="truncate">{dropoff.formatted}</span>
              </div>
            </div>

            {/* Metrics */}
            <div className="flex items-center justify-between sm:justify-end gap-3.5 border-t sm:border-t-0 border-zinc-800 pt-2 sm:pt-0">
              <div className="text-left sm:text-right">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                  Trip Fare
                </div>
                <div className="text-sm font-black text-emerald-400">
                  ৳{finalFare} Taka
                </div>
              </div>

              <div className="text-left sm:text-right">
                <div className="text-[11px] text-zinc-400 flex items-center sm:justify-end gap-1">
                  <Milestone className="w-3 h-3 text-zinc-400" />
                  <span>Distance</span>
                </div>
                <div className="text-sm font-bold text-white">
                  {distanceKm} km
                </div>
              </div>

              <div className="text-right">
                <div className="text-[11px] text-zinc-400 flex items-center justify-end gap-1">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  <span>ETA</span>
                </div>
                <div className="text-sm font-bold text-emerald-400">
                  {durationMinutes} min
                </div>
              </div>
            </div>
          </div>

          {/* Real-time Tracking Controls */}
          <div className="flex items-center justify-between pt-3 border-t border-zinc-900 text-xs">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isNavigating ? 'bg-emerald-500 animate-pulse' : tripCompleted ? 'bg-blue-500' : 'bg-amber-500'}`} />
              <span className="text-zinc-300 font-medium">
                {tripCompleted ? 'Trip Finished' : isNavigating ? 'Real-time Tracking Active' : 'Navigation Paused'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="toggle-nav-button"
                type="button"
                onClick={() => {
                  if (tripCompleted) {
                    handleResetTrip();
                  } else {
                    setIsNavigating(!isNavigating);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white rounded-lg transition-colors cursor-pointer"
              >
                {tripCompleted ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Replay</span>
                  </>
                ) : isNavigating ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </>
                )}
              </button>

              <button
                id="new-ride-button"
                type="button"
                onClick={onBackToRequest}
                className="px-3 py-1.5 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors cursor-pointer"
              >
                New Ride
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
