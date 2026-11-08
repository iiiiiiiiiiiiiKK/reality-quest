/**
 * The map surface.
 *
 * Built on Leaflet + official OpenStreetMap tiles. Nothing here invents
 * geography: every marker is either a real OSM feature, a user-picked
 * coordinate, or the browser's own reported GPS fix.
 */

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { TILE_ATTRIBUTION, TILE_URL } from '../lib/services';
import { pickLang } from '../lib/i18n';
import type { Completion, GeoFix, Lang, Quest } from '../lib/types';
import { haversineMeters } from '../lib/geo';

export type MapMode = 'browse' | 'pick';

export interface QuestMapProps {
  lang: Lang;
  center: { lat: number; lng: number };
  zoom: number;
  quests: Quest[];
  completions: Completion[];
  selectedId?: string;
  location: GeoFix | null;
  mode?: MapMode;
  pickPoint?: { lat: number; lng: number } | null;
  /** Externally requested fly-to (search result, random quest, my location). */
  flyTo?: { lat: number; lng: number; zoom?: number } | null;
  showFootprint?: boolean;
  onSelect?: (id: string) => void;
  onPick?: (p: { lat: number; lng: number }) => void;
  onCenterChange?: (c: { lat: number; lng: number; zoom: number }) => void;
  onTileError?: () => void;
}

const CATEGORY_GLYPH: Record<Quest['category'], string> = {
  city: '▦',
  nature: '❧',
  culture: '❖',
  photo: '◉',
  random: '✦',
};

function questIcon(quest: Quest, opts: { selected: boolean; completed: boolean; locked: boolean }) {
  const cls = [
    'rq-pin',
    opts.selected ? 'is-selected' : '',
    opts.completed ? 'is-completed' : '',
    opts.locked ? 'is-locked' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return L.divIcon({
    className: 'rq-marker',
    html: `<div class="${cls}" style="--pin-color: var(--accent-${quest.category});"><span>${
      opts.completed ? '✓' : CATEGORY_GLYPH[quest.category]
    }</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 30],
    popupAnchor: [0, -28],
  });
}

const meIcon = L.divIcon({
  className: 'rq-marker',
  html: '<div class="rq-me"><div class="rq-me-ring"></div></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const pickIcon = L.divIcon({
  className: 'rq-marker',
  html: '<div class="rq-pick"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/** Keeps the imperative Leaflet view in sync with React state. */
function MapController({
  center,
  zoom,
  onCenterChange,
  mode,
  onPick,
  focus,
}: {
  center: { lat: number; lng: number };
  zoom: number;
  onCenterChange?: (c: { lat: number; lng: number; zoom: number }) => void;
  mode: MapMode;
  onPick?: (p: { lat: number; lng: number }) => void;
  focus?: { lat: number; lng: number; zoom?: number } | null;
}) {
  const map = useMap();
  const lastExternal = useRef<string>('');

  useEffect(() => {
    const key = `${center.lat.toFixed(5)}:${center.lng.toFixed(5)}:${zoom}`;
    if (lastExternal.current === key) return;
    lastExternal.current = key;
    map.setView([center.lat, center.lng], zoom, { animate: true });
  }, [center.lat, center.lng, zoom, map]);

  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lng], focus.zoom ?? map.getZoom(), { duration: 0.9 });
  }, [focus, map]);

  useMapEvents({
    moveend() {
      const c = map.getCenter();
      lastExternal.current = `${c.lat.toFixed(5)}:${c.lng.toFixed(5)}:${map.getZoom()}`;
      onCenterChange?.({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    },
    click(e) {
      if (mode === 'pick') onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  return null;
}

export default function QuestMap(props: QuestMapProps) {
  const {
    lang,
    center,
    zoom,
    quests,
    completions,
    selectedId,
    location,
    mode = 'browse',
    pickPoint,
    flyTo,
    showFootprint = false,
    onSelect,
    onPick,
    onCenterChange,
    onTileError,
  } = props;

  const completedIds = useMemo(() => new Set(completions.map((c) => c.questId)), [completions]);

  /** Footprint path uses the *verified arrival* points, in time order. */
  const trail = useMemo(() => {
    if (!showFootprint) return [];
    return [...completions]
      .sort((a, b) => a.completedAt - b.completedAt)
      .map((c) => [c.location.lat, c.location.lng] as [number, number]);
  }, [completions, showFootprint]);

  /** Fly to an explicit target first, then to a newly selected quest. */
  const focus = useMemo(() => {
    if (flyTo) return flyTo;
    const q = quests.find((x) => x.id === selectedId);
    if (!q) return null;
    return { lat: q.lat, lng: q.lng };
  }, [quests, selectedId, flyTo]);

  const visibleQuests = useMemo(
    () =>
      quests.filter((q) => {
        // Guard against bad upstream coordinates ever reaching the map layer.
        if (!Number.isFinite(q.lat) || !Number.isFinite(q.lng)) return false;
        if (Math.abs(q.lat) > 90 || Math.abs(q.lng) > 180) return false;
        return true;
      }),
    [quests],
  );

  const distanceToMe = useMemo(() => {
    if (!location) return undefined;
    return (q: Quest) => haversineMeters(location, { lat: q.lat, lng: q.lng });
  }, [location]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        minZoom={2}
        maxZoom={19}
        zoomControl={false}
        attributionControl
        className="h-full w-full"
        style={{ background: 'var(--ink-950)' }}
        worldCopyJump
      >
        <TileLayer
          url={TILE_URL}
          attribution={TILE_ATTRIBUTION}
          maxZoom={19}
          detectRetina
          eventHandlers={{ tileerror: () => onTileError?.() }}
        />
        <MapController
          center={center}
          zoom={zoom}
          onCenterChange={onCenterChange}
          mode={mode}
          onPick={onPick}
          focus={focus}
        />

        {showFootprint && trail.length > 1 ? (
          <Polyline
            positions={trail}
            pathOptions={{ color: 'var(--signal)', weight: 2.5, opacity: 0.72, dashArray: '6 6' }}
          />
        ) : null}

        {visibleQuests.map((q) => {
          const completed = completedIds.has(q.id);
          const locked = Boolean(q.minLevel && q.minLevel > 1);
          void distanceToMe;
          return (
            <Marker
              key={q.id}
              position={[q.lat, q.lng]}
              icon={questIcon(q, { selected: q.id === selectedId, completed, locked })}
              eventHandlers={{
                click: () => onSelect?.(q.id),
              }}
              keyboard
              title={pickLang(q.title, lang)}
              zIndexOffset={q.id === selectedId ? 1000 : 0}
            />
          );
        })}

        {location ? (
          <>
            <Circle
              center={[location.lat, location.lng]}
              radius={Math.min(Math.max(location.accuracy, 8), 500)}
              pathOptions={{
                color: '#2ea8ff',
                weight: 1,
                opacity: 0.55,
                fillColor: '#2ea8ff',
                fillOpacity: 0.1,
                className: 'rq-accuracy',
              }}
            />
            <Marker position={[location.lat, location.lng]} icon={meIcon} zIndexOffset={2000} />
          </>
        ) : null}

        {pickPoint ? <Marker position={[pickPoint.lat, pickPoint.lng]} icon={pickIcon} /> : null}
      </MapContainer>
    </div>
  );
}
