import { useState, useEffect } from 'react';
import { LocationPoint, RouteData, RideStage, UserRole, RideRequest } from './types';
import { getGeoapifyApiKey, saveGeoapifyApiKey, calculateRoute } from './services/geoapify';
import {
  subscribeToRideUpdates,
  requestNewRide,
  cancelRide,
  clearCurrentRide,
  generatePassengerId,
  generateRiderId,
} from './services/rideSync';
import { RoleSelectDashboard } from './components/RoleSelectDashboard';
import { RideRequestForm } from './components/RideRequestForm';
import { RiderDashboard } from './components/RiderDashboard';
import { NavigationMap } from './components/NavigationMap';

export default function App() {
  // Role selection state: null = dashboard shown first!
  const [role, setRole] = useState<UserRole | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const paramRole = params.get('role');
      if (paramRole === 'passenger' || paramRole === 'rider') {
        return paramRole as UserRole;
      }
    }
    return null;
  });

  // Generated Guest IDs
  const [passengerId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('geoapify_guest_pax_id');
      if (stored) return stored;
      const newId = generatePassengerId();
      sessionStorage.setItem('geoapify_guest_pax_id', newId);
      return newId;
    }
    return generatePassengerId();
  });

  const [riderId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('geoapify_guest_rider_id');
      if (stored) return stored;
      const newId = generateRiderId();
      sessionStorage.setItem('geoapify_guest_rider_id', newId);
      return newId;
    }
    return generateRiderId();
  });

  const [stage, setStage] = useState<RideStage>('request');
  const [apiKey, setApiKey] = useState<string>(() => getGeoapifyApiKey());
  const [pickup, setPickup] = useState<LocationPoint | null>(null);
  const [dropoff, setDropoff] = useState<LocationPoint | null>(null);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Synchronized active ride state across all components and tabs
  const [activeRide, setActiveRide] = useState<RideRequest | null>(null);

  // Subscribe to real-time ride updates (BroadcastChannel & storage sync)
  useEffect(() => {
    const unsubscribe = subscribeToRideUpdates((ride) => {
      setActiveRide(ride);

      // If active ride has been set and we're in passenger view, sync pickup/dropoff/route
      if (ride) {
        if (!pickup) setPickup(ride.pickup);
        if (!dropoff) setDropoff(ride.dropoff);
        if (ride.routeData && !routeData) setRouteData(ride.routeData);

        // When ride is in_transit, passenger can see navigation map
        if (ride.status === 'in_transit' && ride.routeData) {
          setStage('navigation');
        } else if (ride.status === 'completed' || ride.status === 'cancelled' || ride.status === 'declined') {
          if (stage === 'navigation') {
            setStage('request');
          }
        }
      }
    });

    return () => unsubscribe();
  }, [pickup, dropoff, routeData, stage]);

  const handleApiKeyChange = (newKey: string) => {
    setApiKey(newKey);
    saveGeoapifyApiKey(newKey);
  };

  const handleSelectRole = (selectedRole: UserRole) => {
    setRole(selectedRole);
    setErrorMessage(null);
  };

  const handleBackToRoles = () => {
    setRole(null);
    setErrorMessage(null);
  };

  const handleSwitchToPassenger = () => {
    setRole('passenger');
    setErrorMessage(null);
  };

  const handleSwitchToRider = () => {
    setRole('rider');
    setErrorMessage(null);
  };

  // Passenger clicks "Request for Ride"
  const handleRequestRide = async () => {
    if (!pickup || !dropoff) {
      setErrorMessage('Please select both pickup and drop-off spots.');
      return;
    }

    const keyToUse = apiKey.trim() || getGeoapifyApiKey();
    if (!keyToUse) {
      setErrorMessage('Please enter your Geoapify API key to calculate the route.');
      return;
    }

    setIsLoadingRoute(true);
    setErrorMessage(null);

    try {
      // Direct call to Geoapify Routing API - strictly no mock data
      const route = await calculateRoute(pickup, dropoff, keyToUse);
      setRouteData(route);

      // Dispatch real-time ride request to Rider Dashboard
      requestNewRide(passengerId, pickup, dropoff, route);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to calculate navigation route using Geoapify.');
    } finally {
      setIsLoadingRoute(false);
    }
  };

  const handleCancelRide = () => {
    cancelRide();
  };

  const handleResetRide = () => {
    clearCurrentRide();
    setPickup(null);
    setDropoff(null);
    setRouteData(null);
    setStage('request');
  };

  const handleBackToRequest = () => {
    setStage('request');
  };

  // STEP 1: If role is not selected, display the initial Selection Dashboard first!
  if (role === null) {
    return <RoleSelectDashboard onSelectRole={handleSelectRole} />;
  }

  // STEP 2: Rider View
  if (role === 'rider') {
    return (
      <RiderDashboard
        riderId={riderId}
        activeRide={activeRide}
        apiKey={apiKey}
        onBackToRoles={handleBackToRoles}
        onSwitchToPassenger={handleSwitchToPassenger}
      />
    );
  }

  // STEP 3: Passenger View (Ride Request Section & Navigation)
  return (
    <main className="w-full min-h-screen bg-black text-white selection:bg-zinc-800 selection:text-white flex flex-col">
      {stage === 'request' || !activeRide || activeRide.status !== 'in_transit' ? (
        <div className="flex-1 flex items-center justify-center py-6">
          <RideRequestForm
            apiKey={apiKey}
            onApiKeyChange={handleApiKeyChange}
            passengerId={passengerId}
            pickup={pickup}
            setPickup={setPickup}
            dropoff={dropoff}
            setDropoff={setDropoff}
            onRequestRide={handleRequestRide}
            isLoadingRoute={isLoadingRoute}
            errorMessage={errorMessage}
            setErrorMessage={setErrorMessage}
            activeRide={activeRide}
            onCancelRide={handleCancelRide}
            onResetRide={handleResetRide}
            onBackToRoles={handleBackToRoles}
            onSwitchToRider={handleSwitchToRider}
          />
        </div>
      ) : (
        pickup &&
        dropoff &&
        routeData && (
          <NavigationMap
            pickup={pickup}
            dropoff={dropoff}
            routeData={routeData}
            apiKey={apiKey}
            fareTaka={activeRide?.fareTaka}
            passengerId={passengerId}
            riderId={activeRide?.riderId}
            onBackToRequest={handleBackToRequest}
          />
        )
      )}
    </main>
  );
}
