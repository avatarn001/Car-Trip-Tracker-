import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { GpsPoint } from '../types';

interface TripMapProps {
  points: GpsPoint[];
  currentLocation?: { lat: number; lng: number } | null;
  startPoint?: { lat: number; lng: number } | null;
  endPoint?: { lat: number; lng: number } | null;
  className?: string;
  height?: string;
  interactive?: boolean;
}

export const TripMap: React.FC<TripMapProps> = ({
  points,
  currentLocation,
  startPoint,
  endPoint,
  className = '',
  height = '280px',
  interactive = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markersRef = useRef<{
    start?: L.Marker;
    end?: L.Marker;
    current?: L.Marker;
  }>({});

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Default center (Bangkok, Thailand)
    const initialLat = startPoint?.lat || currentLocation?.lat || (points.length > 0 ? points[0].lat : 13.7563);
    const initialLng = startPoint?.lng || currentLocation?.lng || (points.length > 0 ? points[0].lng : 100.5018);

    // Initialize map if not already created
    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 14,
        zoomControl: interactive,
        dragging: interactive,
        scrollWheelZoom: interactive,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
    }

    const map = mapRef.current;

    // Custom Icons using SVG data
    const startIcon = L.divIcon({
      className: 'custom-map-icon',
      html: `<div style="background-color:#16a34a;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;font-weight:bold;font-size:12px;">S</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const endIcon = L.divIcon({
      className: 'custom-map-icon',
      html: `<div style="background-color:#dc2626;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;font-weight:bold;font-size:12px;">E</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const carIcon = L.divIcon({
      className: 'custom-map-icon',
      html: `<div style="background-color:#2563eb;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(37,99,235,0.4);border:2px solid white;font-size:16px;">🚗</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    // Update Route Polyline
    const latLngs: L.LatLngExpression[] = points.map(p => [p.lat, p.lng]);
    if (polylineRef.current) {
      polylineRef.current.setLatLngs(latLngs);
    } else {
      polylineRef.current = L.polyline(latLngs, {
        color: '#2563eb',
        weight: 4,
        opacity: 0.85,
        lineJoin: 'round',
      }).addTo(map);
    }

    // Update Start Marker
    const effectiveStart = startPoint || (points.length > 0 ? points[0] : null);
    if (effectiveStart) {
      if (markersRef.current.start) {
        markersRef.current.start.setLatLng([effectiveStart.lat, effectiveStart.lng]);
      } else {
        markersRef.current.start = L.marker([effectiveStart.lat, effectiveStart.lng], { icon: startIcon })
          .addTo(map)
          .bindPopup('จุดเริ่มต้น (Start)');
      }
    }

    // Update End Marker
    if (endPoint) {
      if (markersRef.current.end) {
        markersRef.current.end.setLatLng([endPoint.lat, endPoint.lng]);
      } else {
        markersRef.current.end = L.marker([endPoint.lat, endPoint.lng], { icon: endIcon })
          .addTo(map)
          .bindPopup('จุดสิ้นสุด (End)');
      }
    }

    // Update Current Location / Vehicle Marker
    if (currentLocation) {
      if (markersRef.current.current) {
        markersRef.current.current.setLatLng([currentLocation.lat, currentLocation.lng]);
      } else {
        markersRef.current.current = L.marker([currentLocation.lat, currentLocation.lng], { icon: carIcon })
          .addTo(map)
          .bindPopup('ตำแหน่งปัจจุบัน');
      }
    }

    // Auto fit bounds
    if (latLngs.length > 1) {
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    } else if (currentLocation) {
      map.setView([currentLocation.lat, currentLocation.lng], 15);
    } else if (effectiveStart) {
      map.setView([effectiveStart.lat, effectiveStart.lng], 15);
    }

    // Invalidate size on container resize
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [points, currentLocation, startPoint, endPoint, interactive]);

  // Clean up map on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      id="trip-map-container"
      className={`relative w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm isolate z-0 ${className}`}
      style={{ height }}
    >
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
};
