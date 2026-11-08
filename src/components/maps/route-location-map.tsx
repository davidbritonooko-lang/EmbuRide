"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";

export type MapPoint = { lat: number; lon: number; label: string };

type Props = {
  pickup: MapPoint | null;
  destination: MapPoint | null;
  onMapPick: (point: { lat: number; lon: number }) => void;
};

export function RouteLocationMap({ pickup, destination, onMapPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<{ pickup?: Marker; destination?: Marker }>({});
  const onPickRef = useRef(onMapPick);

  useEffect(() => {
    onPickRef.current = onMapPick;
  }, [onMapPick]);

  useEffect(() => {
    let disposed = false;
    let createdMap: LeafletMap | null = null;

    void import("leaflet").then((L) => {
      if (disposed || !containerRef.current) return;
      const map = L.map(containerRef.current, {
        center: [-0.539, 37.457],
        zoom: 10,
        scrollWheelZoom: false,
      });
      createdMap = map;
      mapRef.current = map;
      setMapReady(true);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      map.on("click", (event) => {
        onPickRef.current({ lat: event.latlng.lat, lon: event.latlng.lng });
      });
    });

    return () => {
      disposed = true;
      if (createdMap) createdMap.remove();
      mapRef.current = null;
      setMapReady(false);
      markersRef.current = {};
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    void import("leaflet").then((L) => {
      if (disposed || !mapReady || !mapRef.current) return;
      const map = mapRef.current;
      const markerConfig = (kind: "pickup" | "destination") => L.divIcon({
        className: "emburide-map-marker",
        html: '<span class="emburide-map-marker__dot emburide-map-marker__dot--' + kind + '"></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      for (const kind of ["pickup", "destination"] as const) {
        const point = kind === "pickup" ? pickup : destination;
        const existing = markersRef.current[kind];
        if (existing) {
          map.removeLayer(existing);
          delete markersRef.current[kind];
        }
        if (point) {
          markersRef.current[kind] = L.marker([point.lat, point.lon], {
            icon: markerConfig(kind),
            title: kind === "pickup" ? "Pickup location" : "Destination",
          }).addTo(map).bindPopup(kind === "pickup" ? "Pickup" : "Destination");
        }
      }

      const points = [pickup, destination].filter((point): point is MapPoint => point !== null);
      if (points.length === 2) {
        map.fitBounds(
          L.latLngBounds(points.map((point) => [point.lat, point.lon] as [number, number])),
          { padding: [36, 36], maxZoom: 14 },
        );
      } else if (points.length === 1) {
        map.setView([points[0].lat, points[0].lon], 14);
      }
    });
    return () => { disposed = true; };
  }, [pickup, destination, mapReady]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div ref={containerRef} className="h-[280px] w-full sm:h-[340px]" aria-label="Interactive Embu County location map" />
      <p className="bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Select Pickup or Destination, then tap the map to place that location.
      </p>
    </div>
  );
}
