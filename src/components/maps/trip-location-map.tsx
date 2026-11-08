"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";

export type TripLocationPoint = {
  latitude: number;
  longitude: number;
  recordedAt: string;
};

export function TripLocationMap({ location }: { location: TripLocationPoint }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let createdMap: LeafletMap | null = null;

    void import("leaflet").then((L) => {
      if (disposed || !containerRef.current) return;
      const map = L.map(containerRef.current, {
        center: [-0.539, 37.457],
        zoom: 14,
        scrollWheelZoom: false,
      });
      createdMap = map;
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      setMapReady(true);
    });

    return () => {
      disposed = true;
      createdMap?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    void import("leaflet").then((L) => {
      if (disposed || !mapReady || !mapRef.current) return;
      const map = mapRef.current;
      const point: [number, number] = [location.latitude, location.longitude];

      if (!markerRef.current) {
        markerRef.current = L.marker(point, {
          title: "Driver's latest shared location",
          icon: L.divIcon({
            className: "emburide-map-marker",
            html: '<span class="emburide-map-marker__dot emburide-map-marker__dot--driver"></span>',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        }).addTo(map);
      } else {
        markerRef.current.setLatLng(point);
      }

      map.panTo(point, { animate: true, duration: 0.4 });
    });

    return () => { disposed = true; };
  }, [location.latitude, location.longitude, mapReady]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div
        ref={containerRef}
        className="h-[220px] w-full sm:h-[280px]"
        aria-label="Latest shared driver location during this active trip"
      />
      <p className="bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Driver location updates are available only while the booking is active and location sharing is on.
      </p>
    </div>
  );
}
