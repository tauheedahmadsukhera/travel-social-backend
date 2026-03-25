import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export interface LocationCoords {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  altitudeAccuracy?: number;
  heading?: number;
  speed?: number;
}

export function useCurrentLocation() {
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        altitude: loc.coords.altitude ?? undefined,
        accuracy: loc.coords.accuracy ?? undefined,
        altitudeAccuracy: loc.coords.altitudeAccuracy ?? undefined,
        heading: loc.coords.heading ?? undefined,
        speed: loc.coords.speed ?? undefined,
      });
    })();
  }, []);

  return { location, errorMsg };
}
