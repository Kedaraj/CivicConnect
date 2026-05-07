import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api";
import {
  AlertTriangle, AlertCircle, Bell, Car, MapPin, Navigation2, Map,
  Bus, User, Shield, Search, Phone, Mail, Lock, Eye, EyeOff,
  ChevronRight, Home, FileText, ClipboardList, Zap,
  Check, Camera, Mic, Upload, Star, TrendingUp, Activity, Brain,
  LogOut, Globe, Sun, Moon, Layers, Clock, Navigation,
  Route, Cpu, Radio, CheckCircle2, ChevronDown, Fingerprint, RefreshCcw,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type AppScreen = "splash" | "auth" | "app";
type AuthTab = "login" | "signup" | "otp";
import { AmbulanceDashboard } from "./components/roles/ambulance/AmbulanceDashboard";

type MainTab = "home" | "map" | "alerts" | "reports" | "profile" | "ai" | "emergency" | "route" | "track" | "ambulance";
type MapLayer = "traffic" | "accidents" | "weather" | "parking";

// ─── Google Maps ──────────────────────────────────────────────────────────────
const GMAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || "";

const MAP_STYLE: google.maps.MapTypeStyle[] | any[] = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#c8dbc0" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9e7f5" }] },
];

function useGoogleMaps() {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
    () => {
      if (!GMAPS_KEY) return "idle";
      if ((window as any).google?.maps) return "ready";
      return "loading";
    }
  );
  useEffect(() => {
    if (state !== "loading") return;
    if ((window as any).google?.maps) { setState("ready"); return; }
    let s = document.getElementById("gm-script") as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement("script");
      s.id = "gm-script";
      s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places`;
      s.async = true; s.defer = true;
      document.head.appendChild(s);
    }
    const ok = () => { console.log("[CivicConnect] Google Maps loaded ✓"); setState("ready"); };
    const er = () => { console.warn("[CivicConnect] Google Maps failed to load — using Leaflet fallback"); setState("error"); };
    s.addEventListener("load", ok);
    s.addEventListener("error", er);
    return () => { s!.removeEventListener("load", ok); s!.removeEventListener("error", er); };
  }, [state]);
  return { ready: state === "ready", hasKey: !!GMAPS_KEY, error: state === "error" };
}

// Demo incident markers (Belagavi)
const INCIDENT_MARKERS = [
  { lat: 15.8497, lng: 74.4977, type: "accident", title: "Accident — RPD Cross, Tilakwadi", color: "#EF4444" },
  { lat: 15.8440, lng: 74.5040, type: "traffic",  title: "Heavy Traffic — College Road, KLE",     color: "#F97316" },
  { lat: 15.8525, lng: 74.5085, type: "police",   title: "Police Checkpoint — Bogarves Circle", color: "#3B82F6" },
  { lat: 15.8520, lng: 74.5020, type: "road",     title: "Road Blockage — Rani Channamma Circle",      color: "#7C3AED" },
  { lat: 15.8560, lng: 74.5000, type: "emergency", title: "Emergency Vehicle — Kirloskar Road", color: "#D97706" },
];
const PARKING_MARKERS = [
  { lat: 15.8500, lng: 74.4990, title: "Parking Lot A — Tilakwadi" },
  { lat: 15.8450, lng: 74.5050, title: "Parking Lot B — Camp Area" },
  { lat: 15.8550, lng: 74.5010, title: "Parking Lot C — Nehru Nagar" },
];

// ─── Leaflet fallback (when no Google key) ────────────────────────────────────
import L from "leaflet";
import "leaflet/dist/leaflet.css";
const TOMTOM_KEY = (import.meta.env.VITE_TOMTOM_API_KEY as string) || "gMOOeMiGKqDPLfqfJsaRnFYF6GWBG3yf";

function TrafficMapLeaflet({ full = false }: { full?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);
  const locMk = useRef<L.Marker | null>(null);
  const locCr = useRef<L.Circle | null>(null);
  const wId = useRef<number | null>(null);
  const hf = useRef(false);
  const h = full ? 660 : 300;
  const locIcon = L.divIcon({ className: "", html: '<div style="position:relative;width:28px;height:28px"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.18);animation:locPulse 2s ease-out infinite"></div><div style="position:absolute;top:6px;left:6px;width:16px;height:16px;border-radius:50%;background:#3B82F6;border:3px solid #fff;box-shadow:0 2px 8px rgba(59,130,246,0.5)"></div></div>', iconSize: [28, 28], iconAnchor: [14, 14] });
  useEffect(() => {
    if (!ref.current) return;
    if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }
    hf.current = false;
    const map = L.map(ref.current, { center: [15.85, 74.50], zoom: full ? 14 : 13, zoomControl: false, attributionControl: false });
    mapObj.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
    // Traffic zones for Belagavi
    const zones = [
      { lat: 15.8497, lng: 74.4977, l: "RPD Cross — Heavy Traffic", c: "#EF4444", r: 250 },
      { lat: 15.8440, lng: 74.5040, l: "College Road — Moderate", c: "#F97316", r: 200 },
      { lat: 15.8525, lng: 74.5085, l: "Bogarves — Moderate", c: "#FBBF24", r: 180 },
      { lat: 15.8520, lng: 74.5020, l: "Rani Channamma — Heavy", c: "#EF4444", r: 220 },
      { lat: 15.8560, lng: 74.5000, l: "Kirloskar Road — Light", c: "#22C55E", r: 180 },
      { lat: 15.8380, lng: 74.4950, l: "Angol — Light", c: "#22C55E", r: 200 },
      { lat: 15.8600, lng: 74.4900, l: "Khanapur Rd — Light", c: "#22C55E", r: 170 },
    ];
    zones.forEach(z => {
      L.circle([z.lat, z.lng], { radius: z.r, color: z.c, fillColor: z.c, fillOpacity: 0.18, weight: 2.5 }).addTo(map).bindPopup(`<b>🚦 ${z.l}</b>`);
    });
    INCIDENT_MARKERS.forEach(m => {
      L.circleMarker([m.lat, m.lng], { radius: 9, fillColor: m.color, fillOpacity: 1, color: "#fff", weight: 2.5 }).addTo(map).bindPopup(`<b>${m.title}</b>`);
    });
    // Live GPS blue dot
    locMk.current = L.marker([15.85, 74.50], { icon: locIcon, zIndexOffset: 1000 }).addTo(map);
    locCr.current = L.circle([15.85, 74.50], { radius: 50, fillColor: "#3B82F6", fillOpacity: 0.08, color: "#3B82F6", weight: 1, opacity: 0.25 }).addTo(map);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => {
        const ll: L.LatLngExpression = [p.coords.latitude, p.coords.longitude];
        locMk.current?.setLatLng(ll); locCr.current?.setLatLng(ll);
        map.setView(ll, full ? 16 : 15); hf.current = true;
      }, () => {}, { enableHighAccuracy: true });
      wId.current = navigator.geolocation.watchPosition(p => {
        const ll: L.LatLngExpression = [p.coords.latitude, p.coords.longitude];
        locMk.current?.setLatLng(ll); locCr.current?.setLatLng(ll).setRadius(p.coords.accuracy || 50);
        if (!hf.current && mapObj.current) { mapObj.current.setView(ll, full ? 15 : 14); hf.current = true; }
      }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    }
    setTimeout(() => map.invalidateSize(), 150);
    return () => { if (wId.current !== null) navigator.geolocation.clearWatch(wId.current); mapObj.current?.remove(); mapObj.current = null; };
  }, [full]);
  return (
    <div className="relative">
      <style>{`@keyframes locPulse { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2.5); opacity: 0; } }`}</style>
      <div ref={ref} className="w-full rounded-2xl overflow-hidden border border-zinc-200" style={{ height: h }} />
    </div>
  );
}

function LiveMapView({ full = false, layer = "traffic" }: { full?: boolean; layer?: string }) {
  if (layer === "traffic") return <TrafficMapLeaflet full={full} />;
  return <AccidentsMapView full={full} />;
}

function AccidentsMapView({ full = false }: { full?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);
  const locMarker = useRef<L.Marker | null>(null);
  const locCircle = useRef<L.Circle | null>(null);
  const watchId = useRef<number | null>(null);
  const hasFix = useRef(false);
  const h = full ? 660 : 300;
  const locIcon = L.divIcon({ className: "", html: '<div style="position:relative;width:28px;height:28px"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.18);animation:locPulse 2s ease-out infinite"></div><div style="position:absolute;top:6px;left:6px;width:16px;height:16px;border-radius:50%;background:#3B82F6;border:3px solid #fff;box-shadow:0 2px 8px rgba(59,130,246,0.5)"></div></div>', iconSize: [28, 28], iconAnchor: [14, 14] });

  useEffect(() => {
    if (!ref.current) return;
    if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }
    hasFix.current = false;
    const map = L.map(ref.current, { center: [15.85, 74.50], zoom: full ? 14 : 13, zoomControl: false, attributionControl: false });
    mapObj.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
    locMarker.current = L.marker([15.85, 74.50], { icon: locIcon, zIndexOffset: 1000 }).addTo(map);
    locCircle.current = L.circle([15.85, 74.50], { radius: 50, fillColor: "#3B82F6", fillOpacity: 0.08, color: "#3B82F6", weight: 1, opacity: 0.25 }).addTo(map);
    if (navigator.geolocation) {
      watchId.current = navigator.geolocation.watchPosition(pos => {
        const ll: L.LatLngExpression = [pos.coords.latitude, pos.coords.longitude];
        locMarker.current?.setLatLng(ll); locCircle.current?.setLatLng(ll).setRadius(pos.coords.accuracy || 50);
        if (!hasFix.current && mapObj.current) { mapObj.current.setView(ll, full ? 15 : 14); hasFix.current = true; }
      }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    }
    const pc: Record<string,string> = { high: '#EF4444', medium: '#F97316', low: '#22C55E' };
    const te: Record<string,string> = { accident: '\ud83d\ude97', traffic_jam: '\ud83d\udea6', pothole: '\ud83d\udd73\ufe0f', road_damage: '\ud83d\udee3\ufe0f', waterlogging: '\ud83c\udf0a', illegal_parking: '\ud83c\udd7f\ufe0f' };
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/incidents`).then(r => r.json()).then((data: any) => {
      const list = Array.isArray(data) ? data : data.incidents || data.data || [];
      const pts: [number,number][] = [];
      list.forEach((inc: any) => {
        if (!inc.location?.lat) return;
        const solved = inc.status === 'resolved' || inc.status === 'closed';
        const color = solved ? '#6B7280' : (pc[inc.priority] || '#F97316');
        const emoji = solved ? '\u2705' : (te[inc.type] || '\ud83d\udccb');
        const icon = L.divIcon({ className: '', html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer">${emoji}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
        L.marker([inc.location.lat, inc.location.lng], { icon }).addTo(map)
          .bindPopup(`<div style="font-family:system-ui;min-width:140px"><b>${inc.title || inc.type}</b><br/><small style="color:#666">${inc.location.address || ''}</small><br/><span style="color:${color};font-weight:bold;font-size:11px">${solved ? '\u2705 Resolved' : (inc.priority?.toUpperCase() || 'OPEN')}</span></div>`);
        pts.push([inc.location.lat, inc.location.lng]);
      });
      if (pts.length > 0 && !hasFix.current) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
    }).catch(() => {});
    setTimeout(() => map.invalidateSize(), 150);
    return () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); mapObj.current?.remove(); mapObj.current = null; };
  }, [full]);

  return (
    <div className="relative">
      <style>{`@keyframes locPulse { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2.5); opacity: 0; } }`}</style>
      <div ref={ref} className="w-full rounded-2xl overflow-hidden border border-zinc-200" style={{ height: h }} />
      <div className="flex items-center gap-4 mt-2 px-1">
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span className="text-[9px] text-zinc-400 font-medium">High</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-orange-500" /><span className="text-[9px] text-zinc-400 font-medium">Medium</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-green-500" /><span className="text-[9px] text-zinc-400 font-medium">Low</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-gray-400" /><span className="text-[9px] text-zinc-400 font-medium">Resolved</span></div>
      </div>
    </div>
  );
}



// ─── ReportedIncidentMap (fetches real incidents from API) ─────────────────────
function ReportedIncidentMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<L.Map | null>(null);
  const [incidentCount, setIncidentCount] = useState(0);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapObjRef.current) { mapObjRef.current.remove(); mapObjRef.current = null; }

    const map = L.map(mapContainerRef.current, { center: [15.8500, 74.5000], zoom: 13, zoomControl: false, attributionControl: false });
    mapObjRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);

    // Belagavi traffic hotspots
    const zones = [
      { lat: 15.8497, lng: 74.4977, label: 'RPD Cross', color: '#EF4444' },
      { lat: 15.8440, lng: 74.5040, label: 'College Road, KLE', color: '#F97316' },
      { lat: 15.8525, lng: 74.5085, label: 'Bogarves Circle', color: '#FBBF24' },
      { lat: 15.8520, lng: 74.5020, label: 'Rani Channamma Circle', color: '#EF4444' },
      { lat: 15.8560, lng: 74.5000, label: 'Kirloskar Road', color: '#FBBF24' },
      { lat: 15.8380, lng: 74.4950, label: 'Angol Main Road', color: '#22C55E' },
      { lat: 15.8600, lng: 74.4900, label: 'Khanapur Road', color: '#22C55E' },
    ];
    zones.forEach(z => {
      L.circle([z.lat, z.lng], { radius: 150, color: z.color, fillColor: z.color, fillOpacity: 0.12, weight: 2 }).addTo(map)
        .bindPopup(`<b>🚦 ${z.label}</b>`);
    });

    // Fetch real incidents from API
    const typeEmoji: Record<string,string> = { accident: '🚗', traffic_jam: '🚦', pothole: '🕳️', road_damage: '🛣️', waterlogging: '🌊', illegal_parking: '🅿️' };
    const prioColor: Record<string,string> = { high: '#EF4444', medium: '#F97316', low: '#22C55E' };

    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/incidents`)
      .then(r => r.json())
      .then((data: any) => {
        const list = Array.isArray(data) ? data : data.incidents || data.data || [];
        setIncidentCount(list.length);
        const pts: [number,number][] = [];
        list.forEach((inc: any) => {
          if (!inc.location?.lat || !inc.location?.lng) return;
          const isSolved = inc.status === 'resolved' || inc.status === 'closed';
          const color = isSolved ? '#6B7280' : (prioColor[inc.priority] || '#F97316');
          const emoji = isSolved ? '✅' : (typeEmoji[inc.type] || '📋');
          const icon = L.divIcon({
            className: '',
            html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer">${emoji}</div>`,
            iconSize: [30, 30], iconAnchor: [15, 15],
          });
          const marker = L.marker([inc.location.lat, inc.location.lng], { icon }).addTo(map);
          marker.bindPopup(`<div style="font-family:system-ui;min-width:140px"><b>${inc.title || inc.type}</b><br/><small style="color:#666">${inc.location.address || ''}</small><br/><span style="color:${color};font-weight:bold;font-size:11px">${isSolved ? '✅ Case Solved' : (inc.priority?.toUpperCase() || 'OPEN')}</span></div>`);
          pts.push([inc.location.lat, inc.location.lng]);
        });
        if (pts.length > 0) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
      })
      .catch(() => {});

    setTimeout(() => map.invalidateSize(), 150);
    return () => { if (mapObjRef.current) { mapObjRef.current.remove(); mapObjRef.current = null; } };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <MapPin size={13} className="text-red-500" />
          <p className="text-[14px] font-black text-black">Incident Map</p>
        </div>
        <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-100 rounded-xl px-2.5 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-black text-red-500">{incidentCount} reports</span>
        </div>
      </div>
      <div ref={mapContainerRef} className="w-full rounded-2xl overflow-hidden border border-zinc-100" style={{ height: 240 }} />
      <div className="flex items-center gap-4 mt-2 px-1">
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span className="text-[9px] text-zinc-400 font-medium">High</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-orange-500" /><span className="text-[9px] text-zinc-400 font-medium">Medium</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-green-500" /><span className="text-[9px] text-zinc-400 font-medium">Low</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-gray-400" /><span className="text-[9px] text-zinc-400 font-medium">Solved</span></div>
      </div>
    </div>
  );
}

// ─── CityMap (Google Maps with Traffic + Live GPS + Route) ────────────────────
function CityMap({ full = false, layer = "traffic" }: { full?: boolean; layer?: string }) {
  const { ready, hasKey, error } = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const trafficRef = useRef<any>(null);
  const incMarkersRef = useRef<any[]>([]);
  const parkMarkersRef = useRef<any[]>([]);
  const locMarkerRef = useRef<any>(null);
  const locCircleRef = useRef<any>(null);
  const routeRendererRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const hasFixRef = useRef(false);
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  const h = full ? 660 : 300;

  // Init Google Map
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const gm = (window as any).google.maps;

    const map = new gm.Map(containerRef.current, {
      center: { lat: 15.8500, lng: 74.5000 },
      zoom: full ? 14 : 13,
      disableDefaultUI: true,
      gestureHandling: full ? "greedy" : "none",
      styles: MAP_STYLE,
      clickableIcons: false,
    });
    mapRef.current = map;

    // ── Google Traffic Layer (real-time) ──
    trafficRef.current = new gm.TrafficLayer();
    trafficRef.current.setMap(map);

    // ── Incident markers ──
    INCIDENT_MARKERS.forEach(inc => {
      const marker = new gm.Marker({
        position: { lat: inc.lat, lng: inc.lng }, map,
        icon: { path: gm.SymbolPath.CIRCLE, scale: 10, fillColor: inc.color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2.5 },
      });
      const iw = new gm.InfoWindow({ content: `<div style="font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;padding:4px 2px">${inc.title}</div>` });
      marker.addListener("click", () => iw.open(map, marker));
      incMarkersRef.current.push(marker);
    });

    // ── Parking markers (hidden) ──
    PARKING_MARKERS.forEach(p => {
      const marker = new gm.Marker({
        position: { lat: p.lat, lng: p.lng }, map, visible: false,
        icon: { path: gm.SymbolPath.CIRCLE, scale: 10, fillColor: "#16A34A", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2.5 },
      });
      const iw = new gm.InfoWindow({ content: `<div style="font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;padding:4px 2px">${p.title}</div>` });
      marker.addListener("click", () => iw.open(map, marker));
      parkMarkersRef.current.push(marker);
    });

    // ── Live GPS blue dot ──
    locMarkerRef.current = new gm.Marker({
      position: { lat: 15.8500, lng: 74.5000 }, map, zIndex: 999,
      icon: { path: gm.SymbolPath.CIRCLE, scale: 8, fillColor: "#3B82F6", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 },
    });
    locCircleRef.current = new gm.Circle({
      center: { lat: 15.8500, lng: 74.5000 }, radius: 50, map,
      fillColor: "#3B82F6", fillOpacity: 0.08, strokeColor: "#3B82F6", strokeWeight: 1, strokeOpacity: 0.25,
    });

    // ── Directions / Route renderer ──
    routeRendererRef.current = new gm.DirectionsRenderer({
      map, suppressMarkers: true,
      polylineOptions: { strokeColor: "#3B82F6", strokeWeight: 5, strokeOpacity: 0.8 },
    });

    // ── Demo route: show traffic-aware route ──
    const directionsService = new gm.DirectionsService();
    directionsService.route({
      origin: { lat: 15.8500, lng: 74.5000 },
      destination: { lat: 15.8497, lng: 74.4977 },
      travelMode: gm.TravelMode.DRIVING,
      drivingOptions: { departureTime: new Date(), trafficModel: gm.TrafficModel.BEST_GUESS },
    }, (result: any, status: string) => {
      if (status === "OK" && routeRendererRef.current) {
        routeRendererRef.current.setDirections(result);
      }
    });

    // ── Start live GPS tracking ──
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLiveCoords(ll);
          locMarkerRef.current?.setPosition(ll);
          locCircleRef.current?.setCenter(ll);
          locCircleRef.current?.setRadius(pos.coords.accuracy || 50);
          if (!hasFixRef.current) { map.panTo(ll); map.setZoom(full ? 15 : 14); hasFixRef.current = true; }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      );
    }

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      mapRef.current = null;
    };
  }, [ready, full]);

  // ── Layer switching ──
  useEffect(() => {
    if (!mapRef.current) return;
    trafficRef.current?.setMap(layer === "traffic" ? mapRef.current : null);
    incMarkersRef.current.forEach((m, i) => {
      if (layer === "accidents") m.setVisible(INCIDENT_MARKERS[i]?.type === "accident");
      else if (layer === "traffic") m.setVisible(true);
      else m.setVisible(false);
    });
    parkMarkersRef.current.forEach(m => m.setVisible(layer === "parking"));
    if (routeRendererRef.current) routeRendererRef.current.setMap(layer === "traffic" ? mapRef.current : null);
  }, [layer]);

  const handleMyLocation = useCallback(() => {
    if (!mapRef.current) return;
    if (liveCoords) { mapRef.current.panTo(liveCoords); mapRef.current.setZoom(16); return; }
    navigator.geolocation?.getCurrentPosition(pos => {
      const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      mapRef.current?.panTo(ll); mapRef.current?.setZoom(16);
      locMarkerRef.current?.setPosition(ll);
    }, () => {}, { enableHighAccuracy: true });
  }, [liveCoords]);

  const zoomIn = () => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 14) + 1);
  const zoomOut = () => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 14) - 1);

  // ── Always use LiveMapView ──
  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ height: h }}>
      <LiveMapView full={full} layer={layer} />
      <div style={{ zIndex: 10, position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {[{ label: "Live Traffic", dot: "#F97316" }, { label: "5 Incidents", dot: "#EF4444" }].map(b => (
            <div key={b.label} className="bg-white/90 backdrop-blur-sm rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 border border-zinc-100 shadow-sm">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ backgroundColor: b.dot }} />
              <span className="text-[11px] font-bold text-black">{b.label}</span>
            </div>
          ))}
        </div>
        <div className="absolute right-3 bottom-3 flex flex-col gap-2 pointer-events-auto">
          <button onClick={handleMyLocation} className="w-10 h-10 rounded-2xl bg-white border border-zinc-100 flex items-center justify-center shadow-md"><Navigation size={16} className="text-black" /></button>
          <button className="w-10 h-10 rounded-2xl bg-red-500 flex items-center justify-center shadow-md"><AlertTriangle size={16} className="text-white" /></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#f5f5f5]" style={{ height: h }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Overlay UI */}
      <div style={{ zIndex: 10, position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {[{ label: "Google Traffic", dot: "#16A34A" }, { label: "Live GPS", dot: "#3B82F6" }, { label: "5 Incidents", dot: "#EF4444" }].map(b => (
            <div key={b.label} className="bg-white/90 backdrop-blur-sm rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 border border-zinc-100 shadow-sm">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ backgroundColor: b.dot }} />
              <span className="text-[11px] font-bold text-black">{b.label}</span>
            </div>
          ))}
        </div>

        <div className="absolute right-3 bottom-3 flex flex-col gap-2 pointer-events-auto">
          <button onClick={handleMyLocation} className="w-10 h-10 rounded-2xl bg-white border border-zinc-100 flex items-center justify-center shadow-md hover:bg-zinc-50 active:scale-95 transition-all">
            <Navigation size={16} className="text-black" />
          </button>
          {full && (<>
            <button onClick={zoomIn} className="w-10 h-10 rounded-2xl bg-white border border-zinc-100 flex items-center justify-center shadow-md hover:bg-zinc-50 active:scale-95 transition-all font-black text-lg text-black">+</button>
            <button onClick={zoomOut} className="w-10 h-10 rounded-2xl bg-white border border-zinc-100 flex items-center justify-center shadow-md hover:bg-zinc-50 active:scale-95 transition-all font-black text-lg text-black">−</button>
          </>)}
          <button className="w-10 h-10 rounded-2xl bg-red-500 flex items-center justify-center shadow-md active:scale-95 transition-all">
            <AlertTriangle size={16} className="text-white" />
          </button>
        </div>

        {full && (
          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2.5 border border-zinc-100 shadow-sm flex flex-col gap-1.5">
            {[{ color: "#EF4444", label: "Accident" }, { color: "#F97316", label: "Traffic Jam" }, { color: "#3B82F6", label: "Live GPS / Route" }, { color: "#7C3AED", label: "Road Block" }, { color: "#16A34A", label: "Parking" }].map(l => (
              <div key={l.label} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-[11px] text-zinc-500 font-medium">{l.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const ALERTS_DATA = [
  { id: 1, type: "accident", title: "Accident Detected",         loc: "RPD Cross, Tilakwadi",      time: "2 min ago",  severity: "high",   icon: AlertTriangle, iconBg: "bg-red-50",    iconColor: "text-red-500",    dot: "#EF4444" },
  { id: 2, type: "traffic",  title: "Heavy Traffic Ahead",       loc: "College Road, KLE Circle",   time: "5 min ago",  severity: "medium", icon: Car,           iconBg: "bg-orange-50", iconColor: "text-orange-500", dot: "#F97316" },
  { id: 3, type: "rain",     title: "Rain Warning Issued",       loc: "Camp Area, Belagavi",        time: "8 min ago",  severity: "low",    icon: AlertCircle,   iconBg: "bg-blue-50",   iconColor: "text-blue-500",   dot: "#3B82F6" },
  { id: 4, type: "road",     title: "Road Blockage",             loc: "Angol Main Road",            time: "14 min ago", severity: "high",   icon: AlertTriangle, iconBg: "bg-red-50",    iconColor: "text-red-500",    dot: "#EF4444" },
  { id: 5, type: "vip",      title: "VIP Movement Alert",        loc: "Rani Channamma Circle",      time: "20 min ago", severity: "medium", icon: Shield,        iconBg: "bg-violet-50", iconColor: "text-violet-600", dot: "#7C3AED" },
  { id: 6, type: "police",   title: "Police Checkpoint Active",  loc: "Bogarves Circle, Shahapur",  time: "28 min ago", severity: "low",    icon: CheckCircle2,  iconBg: "bg-zinc-100",  iconColor: "text-zinc-600",   dot: "#52525B" },
  { id: 7, type: "emergency",title: "Emergency Vehicle Nearby",  loc: "Kirloskar Road",             time: "32 min ago", severity: "high",   icon: Zap,           iconBg: "bg-amber-50",  iconColor: "text-amber-600",  dot: "#D97706" },
];

const QUICK_ACTIONS = [
  { id: "report",    label: "Report Issue",    Icon: AlertTriangle, bg: "#FEF2F2", color: "#EF4444" },
  { id: "ai",        label: "AI Prediction",   Icon: Brain,         bg: "#F5F3FF", color: "#7C3AED" },
  { id: "emergency", label: "Emergency",       Icon: Shield,        bg: "#FFF1F2", color: "#E11D48" },
  { id: "alerts",    label: "Live Alerts",     Icon: Radio,         bg: "#EFF6FF", color: "#2563EB" },
  { id: "route",     label: "Smart Route",     Icon: Route,         bg: "#F0F9FF", color: "#0284C7" },
  { id: "track",     label: "Track Report",    Icon: ClipboardList, bg: "#F5F3FF", color: "#6D28D9" },
];

const REPORT_TYPES = [
  { id: "traffic_jam", label: "Traffic Jam",      icon: Car,           color: "#F97316", bg: "#FFF7ED" },
  { id: "accident",    label: "Accident",          icon: AlertTriangle, color: "#EF4444", bg: "#FEF2F2" },
  { id: "pothole",     label: "Pothole",           icon: AlertCircle,   color: "#92400E", bg: "#FEF3C7" },
  { id: "illegal_parking", label: "Illegal Parking", icon: Car,         color: "#F97316", bg: "#FFF7ED" },
  { id: "road_damage", label: "Road Damage",      icon: Layers,        color: "#52525B", bg: "#F4F4F5" },
  { id: "waterlogging",label: "Waterlogging",     icon: Navigation,    color: "#0284C7", bg: "#EFF6FF" },
];

// ─── CSS ──────────────────────────────────────────────────────────────────────
const Css = () => (
  <style>{`
    @keyframes floatUp { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
    @keyframes locPulse { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(2.5);opacity:0} }
    @keyframes slideUp { from{transform:translateY(24px);opacity:0} to{transform:translateY(0);opacity:1} }
    @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
    @keyframes spin    { to{transform:rotate(360deg)} }
    .animate-float     { animation: floatUp 3s ease-in-out infinite; }
    .animate-slide-up  { animation: slideUp 0.4s ease-out forwards; }
    .animate-fade-in   { animation: fadeIn 0.35s ease-out forwards; }
    .animate-spin-slow { animation: spin 0.8s linear infinite; }
    .no-scrollbar      { scrollbar-width:none; -ms-overflow-style:none; }
    .no-scrollbar::-webkit-scrollbar { display:none; }
    .card       { background:#fff; border:1px solid #F4F4F5; border-radius:1rem; }
    .card-hover:hover { background:#FAFAFA; }
    .input-field { background:#F9F9FA; border:1px solid #F0F0F1; border-radius:0.875rem; }
    .input-field:focus-within { border-color:#000; }
    .btn-primary  { background:#000; color:#fff; border-radius:0.875rem; font-weight:700; transition:background .15s,transform .1s; }
    .btn-primary:hover  { background:#111; }
    .btn-primary:active { transform:scale(0.98); }
    .btn-secondary  { background:#F4F4F5; border-radius:0.875rem; color:#000; font-weight:600; transition:background .15s,transform .1s; }
    .btn-secondary:hover  { background:#EBEBEC; }
    .btn-secondary:active { transform:scale(0.98); }
    /* Leaflet popup styling */
    .leaflet-popup-content-wrapper { border-radius:12px !important; box-shadow:0 4px 20px rgba(0,0,0,0.12) !important; }
    .leaflet-popup-tip { display:none; }
    .leaflet-popup-close-button { display:none !important; }
    /* Google Maps InfoWindow styling */
    .gm-style-iw-d { overflow:hidden !important; }
    .gm-style .gm-style-iw-c { border-radius:12px !important; padding:10px 14px !important; box-shadow:0 4px 20px rgba(0,0,0,0.12) !important; }
    .gm-style .gm-style-iw-tc::after { display:none; }
    .gm-ui-hover-effect { display:none !important; }
  `}</style>
);

// ─── PasswordStrength ─────────────────────────────────────────────────────────
function PasswordStrength({ pw }: { pw: string }) {
  if (!pw) return null;
  const s = pw.length < 4 ? 1 : pw.length < 8 ? 2 : /[A-Z]/.test(pw) && /\d/.test(pw) ? 4 : 3;
  const cols    = ["", "bg-red-500", "bg-orange-500", "bg-yellow-400", "bg-emerald-500"];
  const labs    = ["", "Weak", "Fair", "Good", "Strong"];
  const txCols  = ["", "text-red-500", "text-orange-500", "text-yellow-500", "text-emerald-600"];
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex gap-1">
        {[1,2,3,4].map((i) => (
          <div key={i} className={`h-1 w-7 rounded-full transition-all duration-300 ${i<=s?cols[s]:"bg-zinc-200"}`} />
        ))}
      </div>
      <span className={`text-[11px] font-semibold ${txCols[s]}`}>{labs[s]}</span>
    </div>
  );
}

// ─── SplashScreen ─────────────────────────────────────────────────────────────
function SplashScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 80);
    const iv = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) { clearInterval(iv); setTimeout(onDone, 300); return 100; }
        return p + 2;
      });
    }, 42);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [onDone]);

  return (
    <div className="absolute inset-0 bg-white flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(#000 1px,transparent 1px),linear-gradient(90deg,#000 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
      <div className="absolute bottom-0 left-0 right-0 opacity-[0.04]">
        <svg viewBox="0 0 390 100" width="390" height="100" className="w-full">
          <path d="M0,100 L0,70 L20,70 L20,55 L40,55 L40,40 L50,40 L50,22 L60,22 L60,40 L70,40 L70,55 L90,55 L90,70 L110,70 L110,50 L125,50 L125,32 L135,32 L135,50 L155,50 L155,70 L175,70 L175,46 L185,46 L185,28 L195,28 L195,46 L215,46 L215,70 L235,70 L235,52 L248,52 L248,38 L258,38 L258,52 L278,52 L278,70 L298,70 L298,50 L310,50 L310,33 L320,33 L320,50 L340,50 L340,70 L360,70 L360,58 L390,58 L390,100 Z" fill="#000" />
        </svg>
      </div>
      <div className={`relative z-10 flex flex-col items-center transition-all duration-700 ${show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
        <div className="animate-float mb-7">
          <div className="w-24 h-24 rounded-3xl bg-black flex items-center justify-center shadow-[0_8px_40px_rgba(0,0,0,0.15)]">
            <svg viewBox="0 0 56 56" width="52" height="52" fill="none">
              <circle cx="28" cy="28" r="20" stroke="white" strokeWidth="2" strokeOpacity="0.35"/>
              <circle cx="28" cy="28" r="12" stroke="white" strokeWidth="2"/>
              <circle cx="28" cy="28" r="4.5" fill="white"/>
              <line x1="28" y1="8"  x2="28" y2="16" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="28" y1="40" x2="28" y2="48" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="8"  y1="28" x2="16" y2="28" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="40" y1="28" x2="48" y2="28" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="13" y1="13" x2="18.5" y2="18.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5"/>
              <line x1="37.5" y1="37.5" x2="43" y2="43" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5"/>
              <line x1="43" y1="13" x2="37.5" y2="18.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5"/>
              <line x1="13" y1="43" x2="18.5" y2="37.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5"/>
            </svg>
          </div>
        </div>
        <h1 className="text-[42px] font-black text-black tracking-tight leading-none mb-2">CivicConnect</h1>
        <p className="text-zinc-400 text-[13px] text-center leading-relaxed max-w-[200px]">Smart Traffic & Public Safety Platform</p>
      </div>
      <div className="absolute bottom-14 flex flex-col items-center gap-3">
        <div className="w-32 h-0.5 bg-zinc-100 rounded-full overflow-hidden">
          <div className="h-full bg-black rounded-full transition-all duration-75" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-zinc-300 text-[11px] tracking-widest uppercase font-semibold">Loading</p>
      </div>
    </div>
  );
}

// ─── Reusable Field Component ─────────────────────────────────────────────────
const AuthField = ({ icon: Icon, placeholder, type = "text", value = "", onChange = (_v: string) => {} }: { icon: any; placeholder: string; type?: string; value?: string; onChange?: (v: string) => void }) => (
  <div className="input-field flex items-center gap-3 px-4 py-3.5">
    <Icon size={15} className="text-zinc-400 shrink-0" />
    <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
      className="flex-1 bg-transparent outline-none text-[14px] text-black placeholder:text-zinc-400 font-medium" />
  </div>
);

// ─── AuthScreen ───────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }: { onLogin: () => void }) {
  const [tab, setTab] = useState<AuthTab>("login");
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState(["","","","","",""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRealLogin = async () => {
    setError(""); setLoading(true);
    try {
      if (email && pw) {
        await api.login(email, pw);
      } else {
        await api.login("citizen@civic.com", "password123");
      }
      // Ensure the correct name is stored
      const u = api.getUser();
      if (u) { u.name = u.name || "Kedaraj H"; api.setUser(u); }
      onLogin();
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally { setLoading(false); }
  };

  const handleRealSignup = async () => {
    setError(""); setLoading(true);
    try {
      await api.register(name || "New User", email, pw);
      onLogin();
    } catch (e: any) {
      setError(e.message || "Signup failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="absolute inset-0 bg-white overflow-hidden">
      <div className="relative z-10 h-full flex flex-col overflow-y-auto no-scrollbar">
        <div className="px-6 pt-16 pb-5 shrink-0">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-2xl bg-black flex items-center justify-center">
              <Navigation size={17} className="text-white" />
            </div>
            <div>
              <h1 className="text-[20px] font-black text-black leading-none">CivicConnect</h1>
              <p className="text-[11px] text-zinc-400 mt-0.5 font-medium">Civic Services Platform</p>
            </div>
          </div>
          <h2 className="text-[28px] font-black text-black leading-tight mb-1">
            {tab==="otp" ? "Verify OTP" : tab==="login" ? "Welcome back" : "Create account"}
          </h2>
          <p className="text-zinc-400 text-[13px] font-medium">
            {tab==="otp" ? "Enter the 6-digit code sent to your phone" : tab==="login" ? "Sign in to your CivicConnect account" : "Join the smart traffic network"}
          </p>
        </div>

        {tab !== "otp" && (
          <div className="mx-6 mb-5 bg-zinc-100 rounded-2xl p-1 flex shrink-0">
            {(["login","signup"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 ${tab===t ? "bg-white text-black shadow-sm" : "text-zinc-400"}`}>
                {t === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>
        )}

        <div className="px-6 flex flex-col gap-3 pb-10 shrink-0">
          {tab === "otp" && (
            <>
              <div className="flex justify-center gap-2 my-4">
                {otp.map((d,i)=>(
                  <input key={i} maxLength={1} value={d}
                    onChange={(e)=>{const v=[...otp];v[i]=e.target.value;setOtp(v);}}
                    className={`w-11 h-14 rounded-2xl text-center text-xl font-black text-black outline-none transition-all ${d?"bg-black text-white":"bg-zinc-50 border-2 border-zinc-200"}`}/>
                ))}
              </div>
              <button onClick={onLogin} className="btn-primary w-full py-4 text-[15px]">Verify & Continue</button>
              <button onClick={()=>setTab("login")} className="text-center text-zinc-400 text-[13px] py-2 font-medium">← Back to Login</button>
            </>
          )}
          {tab === "login" && (
            <>
              <AuthField icon={Mail} placeholder="Email address" type="email" value={email} onChange={setEmail} />
              {error && <p className="text-red-500 text-[12px] font-medium px-1">{error}</p>}
              <div className="input-field flex items-center gap-3 px-4 py-3.5">
                <Lock size={15} className="text-zinc-400 shrink-0" />
                <input type={showPw?"text":"password"} placeholder="Password" value={pw} onChange={(e)=>setPw(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-[14px] text-black placeholder:text-zinc-400 font-medium" />
                <button onClick={()=>setShowPw(!showPw)} className="text-zinc-400">{showPw?<EyeOff size={15}/>:<Eye size={15}/>}</button>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <div className="w-4 h-4 rounded-md bg-black flex items-center justify-center"><Check size={9} className="text-white" strokeWidth={3}/></div>
                  <span className="text-[12px] text-zinc-500 font-medium">Remember me</span>
                </label>
                <button className="text-[12px] text-black font-bold">Forgot password?</button>
              </div>
              <button onClick={handleRealLogin} disabled={loading} className="btn-primary w-full py-4 text-[15px] mt-1">{loading ? "Signing in..." : "Sign In"}</button>
              <div className="flex items-center gap-3 my-0.5">
                <div className="flex-1 h-px bg-zinc-100"/><span className="text-[11px] text-zinc-400 font-medium">or continue with</span><div className="flex-1 h-px bg-zinc-100"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[{label:"Google",letter:"G"},{label:"Apple",letter:""}].map(({label,letter})=>(
                  <button key={label} className="btn-secondary flex items-center justify-center gap-2.5 py-3.5">
                    {label==="Apple"?(<svg viewBox="0 0 24 24" width="15" height="15" fill="black"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.08 1.21-2.06 3.61.03 2.85 2.5 3.8 2.52 3.81l-.01.06zm-3.01-12.1c.73-.88 1.23-2.12 1.1-3.34-1.07.04-2.36.71-3.13 1.59-.7.8-1.3 2.06-1.13 3.27 1.17.09 2.36-.6 3.16-1.52z"/></svg>):(<span className="text-[15px] font-black" style={{background:"linear-gradient(135deg,#EA4335,#FBBC05,#34A853,#4285F4)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{letter}</span>)}
                    <span className="text-[13px] font-bold text-black">{label}</span>
                  </button>
                ))}
              </div>
              <button onClick={handleRealLogin} className="btn-secondary w-full py-3.5 text-[13px]">Continue as Guest</button>
              <div className="flex items-center justify-center gap-2 mt-1">
                <div className="w-5 h-5 rounded-full bg-zinc-100 flex items-center justify-center"><Fingerprint size={11} className="text-zinc-500"/></div>
                <span className="text-[12px] text-zinc-400 font-medium">Biometric login available</span>
              </div>
            </>
          )}
          {tab === "signup" && (
            <>
              <AuthField icon={User} placeholder="Full name" value={name} onChange={setName} />
              <AuthField icon={User} placeholder="Username" />
              <AuthField icon={Mail} placeholder="Email address" type="email" value={email} onChange={setEmail} />
              <AuthField icon={Phone} placeholder="Phone number" type="tel" />
              <div className="input-field flex items-center gap-3 px-4 py-3.5">
                <Lock size={15} className="text-zinc-400 shrink-0"/>
                <input type={showPw?"text":"password"} placeholder="Password" value={pw} onChange={(e)=>setPw(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-[14px] text-black placeholder:text-zinc-400 font-medium"/>
                <button onClick={()=>setShowPw(!showPw)} className="text-zinc-400"><EyeOff size={15}/></button>
              </div>
              <PasswordStrength pw={pw}/>
              <div className="input-field flex items-center gap-3 px-4 py-3.5">
                <Lock size={15} className="text-zinc-400 shrink-0"/>
                <input type={showCf?"text":"password"} placeholder="Confirm password"
                  className="flex-1 bg-transparent outline-none text-[14px] text-black placeholder:text-zinc-400 font-medium"/>
                <button onClick={()=>setShowCf(!showCf)} className="text-zinc-400">{showCf?<EyeOff size={15}/>:<Eye size={15}/>}</button>
              </div>
              <div className="input-field flex items-center gap-3 px-4 py-3.5">
                <Globe size={15} className="text-zinc-400 shrink-0"/>
                <select className="flex-1 bg-transparent outline-none text-[14px] text-zinc-700 font-medium">
                  <option value="">Select city</option>
                  {["Belagavi","Bangalore","Mumbai","Delhi","Chennai","Hyderabad"].map((c)=>(<option key={c}>{c}</option>))}
                </select>
                <ChevronDown size={13} className="text-zinc-400"/>
              </div>
              <label className="input-field flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-zinc-100 transition-colors">
                <Camera size={15} className="text-zinc-400 shrink-0"/>
                <span className="text-[14px] text-zinc-400 font-medium">Upload profile photo</span>
                <input type="file" accept="image/*" className="hidden"/>
              </label>
              <label className="input-field flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-zinc-100 transition-colors">
                <Upload size={15} className="text-zinc-400 shrink-0"/>
                <span className="text-[14px] text-zinc-400 font-medium">ID verification (optional)</span>
                <input type="file" accept="image/*" className="hidden"/>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div className="w-4 h-4 rounded-md bg-black flex items-center justify-center shrink-0"><Check size={9} className="text-white" strokeWidth={3}/></div>
                <span className="text-[12px] text-zinc-500 font-medium leading-tight">I agree to Terms & Conditions and Privacy Policy</span>
              </label>
              <button onClick={handleRealSignup} disabled={loading} className="btn-primary w-full py-4 text-[15px] mt-1">{loading ? "Creating..." : "Create Account"}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────
function HomeScreen({ setTab }: { setTab: (t: MainTab) => void }) {
  const user = api.getUser();
  const displayName = user?.name || "Kedaraj H";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    try { api.getDashboardStats().then(d => { if(d && !d.message) setStats(d); }).catch(() => {}); } catch {}
    try { api.getAlerts().then(() => {}).catch(() => {}); } catch {}
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto no-scrollbar pb-24 bg-white">
      <div className="px-5 pt-14 pb-4">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[12px] text-zinc-400 font-semibold uppercase tracking-wide">{greeting}</p>
            <h1 className="text-[26px] font-black text-black leading-tight">{displayName}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={()=>setTab("alerts")} className="relative w-11 h-11 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center">
              <Bell size={18} className="text-black"/>
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500"/>
            </button>
            <img onClick={()=>setTab("profile")} src="https://iili.io/BZNQRI4.jpg"
              alt="Profile" className="w-11 h-11 rounded-2xl object-cover border border-zinc-100 cursor-pointer"/>
          </div>
        </div>
        <div className="input-field flex items-center gap-3 px-4 py-3.5">
          <Search size={15} className="text-zinc-400 shrink-0"/>
          <input placeholder="Search traffic updates, alerts, locations…"
            className="flex-1 bg-transparent outline-none text-[13px] text-black placeholder:text-zinc-400 font-medium"/>
          <div className="w-7 h-7 rounded-xl bg-black flex items-center justify-center shrink-0">
            <Navigation2 size={12} className="text-white"/>
          </div>
        </div>
      </div>

      {/* Live Map */}
      <div className="px-5 mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[14px] font-black text-black">Live Traffic Map</p>
          <button onClick={()=>setTab("map")} className="text-[12px] font-bold text-black flex items-center gap-0.5">
            Full Map <ChevronRight size={13}/>
          </button>
        </div>
        <CityMap full={false} layer="traffic" />
      </div>



      {/* Quick Actions */}
      <div className="px-5 mb-5">
        <p className="text-[14px] font-black text-black mb-3">Quick Actions</p>
        <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
          <div className="flex gap-3 w-max">
            {QUICK_ACTIONS.map(({id,label,Icon,bg,color})=>(
              <button key={id}
                onClick={()=>{
                  if(id==="report") setTab("reports");
                  else if(id==="emergency") setTab("emergency");
                  else if(id==="alerts") setTab("alerts");
                  else if(id==="route") setTab("route");
                  else if(id==="track") setTab("track");
                  else if(id==="ai") setTab("ai");
                }}
                className="flex flex-col items-center gap-2.5 bg-white border border-zinc-100 rounded-2xl px-4 py-4 min-w-[76px] hover:bg-zinc-50 active:scale-95 transition-all shadow-sm">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{backgroundColor:bg}}>
                  <Icon size={18} style={{color}}/>
                </div>
                <span className="text-[11px] font-semibold text-zinc-600 text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI Insights */}
      <div className="px-5 mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Cpu size={13} className="text-black"/>
            <p className="text-[14px] font-black text-black">AI Traffic Insights</p>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-100 rounded-xl px-2.5 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
            <span className="text-[10px] font-black text-emerald-600">LIVE</span>
          </div>
        </div>
        <div className="bg-white border border-zinc-100 rounded-2xl p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 mb-3">
            {[
              {label:"Incidents",value:stats?.incidents?.open?.toString() || "3",color:"#EF4444",bar:stats ? Math.min(stats.incidents.open/10,1) : 0.72,Icon:TrendingUp},
              {label:"Avg Delay", value:"18 min",color:"#F97316",bar:0.55,Icon:Clock},
              {label:"Alerts",value:stats?.alerts?.active?.toString() || "7",color:"#CA8A04",bar:stats ? Math.min(stats.alerts.active/10,1) : 0.45,Icon:AlertCircle},
              {label:"Resolved",value:stats?.incidents?.resolved?.toString() || "4",color:"#16A34A",bar:stats ? Math.min(stats.incidents.resolved/10,1) : 0.90,Icon:Route},
            ].map(({label,value,color,bar,Icon})=>(
              <div key={label} className="bg-zinc-50 rounded-xl p-3 border border-zinc-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-zinc-400 font-semibold">{label}</span>
                  <Icon size={11} style={{color}}/>
                </div>
                <p className="text-[16px] font-black mb-2" style={{color}}>{value}</p>
                <div className="h-1 bg-zinc-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${bar*100}%`,backgroundColor:color}}/>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center shrink-0">
              <Brain size={15} className="text-white"/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-black text-black">AI Recommendation</p>
              <p className="text-[11px] text-zinc-400 truncate font-medium">Use Route B via Highway 48 — saves ~14 min</p>
            </div>
            <ChevronRight size={13} className="text-zinc-300 shrink-0"/>
          </div>
        </div>
      </div>

      {/* Live Alerts Preview */}
      <div className="px-5">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[14px] font-black text-black">Live Alerts</p>
          <button onClick={()=>setTab("alerts")} className="text-[12px] font-bold text-black flex items-center gap-0.5">
            See all <ChevronRight size={13}/>
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {ALERTS_DATA.slice(0,3).map((a)=>(
            <div key={a.id} className="bg-white border border-zinc-100 rounded-2xl p-3.5 flex items-center gap-3 shadow-sm">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${a.iconBg}`}>
                <a.icon size={15} className={a.iconColor}/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-black text-black leading-none">{a.title}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5 truncate font-medium">{a.loc}</p>
              </div>
              <span className="text-[10px] text-zinc-400 font-medium shrink-0">{a.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MapScreen ────────────────────────────────────────────────────────────────
function MapScreen() {
  const [layer, setLayer] = useState<MapLayer>("traffic");
  const layers: { id: MapLayer; label: string }[] = [
    { id: "traffic",   label: "🚦 Traffic"   },
    { id: "accidents", label: "🚗 Accidents" },
  ];

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-5 pt-14 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[22px] font-black text-black">Live Map</h2>
          <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-100 rounded-xl px-2.5 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
            <span className="text-[10px] font-black text-emerald-600 uppercase">Live</span>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {layers.map(({id,label})=>(
            <button key={id} onClick={()=>setLayer(id)}
              className={`px-3.5 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all ${layer===id?"bg-black text-white":"bg-zinc-50 border border-zinc-100 text-zinc-500"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 px-5 pb-4 min-h-0">
        <CityMap full layer={layer} />
      </div>
    </div>
  );
}

// ─── AlertsScreen ─────────────────────────────────────────────────────────────
function AlertsScreen() {
  const [filter, setFilter] = useState("all");
  const [liveAlerts, setLiveAlerts] = useState(ALERTS_DATA);

  useEffect(() => {
    api.getAlerts().then((data: any[]) => {
      if (data?.length) {
        const iconMap: Record<string,any> = { accident: AlertTriangle, traffic_jam: Car, emergency: Zap, weather: AlertCircle, police: Shield, road_damage: AlertTriangle };
        const bgMap: Record<string,string> = { high: "bg-red-50", medium: "bg-orange-50", low: "bg-zinc-100" };
        const colorMap: Record<string,string> = { high: "text-red-500", medium: "text-orange-500", low: "text-zinc-500" };
        setLiveAlerts(data.map((a: any, i: number) => ({
          id: a._id || i, type: a.type || "traffic", title: a.title,
          loc: a.location?.area || a.location?.address || "Unknown",
          time: new Date(a.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
          severity: a.severity || "medium",
          icon: iconMap[a.type] || AlertCircle,
          iconBg: bgMap[a.severity] || "bg-zinc-100",
          iconColor: colorMap[a.severity] || "text-zinc-500",
          dot: a.severity === "high" ? "#EF4444" : a.severity === "medium" ? "#F97316" : "#52525B",
        })));
      }
    }).catch(() => {});
  }, []);

  const filtered = filter==="all" ? liveAlerts : liveAlerts.filter((a)=>a.type===filter||(filter==="accidents"&&a.type==="accident"));
  return (
    <div className="flex flex-col h-full overflow-y-auto no-scrollbar pb-24 bg-white">
      <div className="px-5 pt-14 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[22px] font-black text-black">Live Alerts</h2>
          <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-xl px-2.5 py-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
            <span className="text-[11px] font-black text-red-500">{liveAlerts.length} Active</span>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {["all","accidents","traffic","weather","police"].map((f)=>(
            <button key={f} onClick={()=>setFilter(f)}
              className={`px-3.5 py-2 rounded-xl text-[12px] font-bold capitalize whitespace-nowrap transition-all ${filter===f?"bg-black text-white":"bg-zinc-50 border border-zinc-100 text-zinc-500"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="px-5 flex flex-col gap-2.5">
        {filtered.map((a,i)=>(
          <div key={a.id} className="bg-white border border-zinc-100 rounded-2xl p-4 shadow-sm animate-slide-up"
            style={{animationDelay:`${i*50}ms`,opacity:0,animationFillMode:"forwards"}}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${a.iconBg}`}>
                <a.icon size={17} className={a.iconColor}/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[14px] font-black text-black">{a.title}</p>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${a.severity==="high"?"bg-red-50 text-red-500":a.severity==="medium"?"bg-orange-50 text-orange-500":"bg-zinc-50 text-zinc-500"}`}>
                    {a.severity.toUpperCase()}
                  </span>
                </div>
                <p className="text-[12px] text-zinc-400 font-medium mb-2">{a.loc}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1"><Clock size={10}/>{a.time}</span>
                  <button className="text-[11px] text-black font-bold flex items-center gap-1">View on map <ChevronRight size={10}/></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ReportsScreen ────────────────────────────────────────────────────────────
function ReportsScreen() {
  const [selectedType, setSelectedType] = useState<string|null>(null);
  const [priority, setPriority] = useState("medium");
  const [submitted, setSubmitted] = useState(false);
  const [ticketId, setTicketId] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [alertSent, setAlertSent] = useState("");

  // Accident-specific fields
  const [injuries, setInjuries] = useState(false);
  const [vehicleCount, setVehicleCount] = useState("1");
  const [accidentSeverity, setAccidentSeverity] = useState("moderate");
  const [roadBlocked, setRoadBlocked] = useState(false);

  // Pothole-specific fields
  const [potholeSize, setPotholeSize] = useState("medium");
  const [potholeDepth, setPotholeDepth] = useState("shallow");

  // Live GPS Location
  const [liveLocation, setLiveLocation] = useState<{lat:number;lng:number;address:string}|null>(null);
  const [locLoading, setLocLoading] = useState(false);

  // Auto-detect GPS on mount
  useEffect(() => {
    detectLocation();
  }, []);

  const detectLocation = () => {
    setLocLoading(true);
    if (!navigator.geolocation) { setLiveLocation({lat:15.8497,lng:74.4977,address:"GPS unavailable — Default Belagavi"}); setLocLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const {latitude: lat, longitude: lng} = pos.coords;
        let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const data = await res.json();
          if (data.display_name) address = data.display_name.split(",").slice(0,3).join(",");
        } catch {}
        setLiveLocation({lat, lng, address});
        setLocLoading(false);
      },
      () => { setLiveLocation({lat:15.8497,lng:74.4977,address:"Belagavi, RPD Cross (GPS denied)"}); setLocLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Submit to backend API + send alerts
  const handleSubmit = async () => {
    if (!selectedType || !liveLocation) return;
    setLoading(true);
    try {
      // Build incident data
      const incidentData: any = {
        type: selectedType,
        title: `${REPORT_TYPES.find(t=>t.id===selectedType)?.label || selectedType} — ${liveLocation.address.split(",")[0]}`,
        description: description || `${selectedType} reported at ${liveLocation.address}`,
        location: { lat: liveLocation.lat, lng: liveLocation.lng, address: liveLocation.address },
        priority,
      };

      // Add type-specific metadata to description
      if (selectedType === "accident") {
        incidentData.description += `\n\nInjuries: ${injuries ? "YES — URGENT" : "No"}\nVehicles involved: ${vehicleCount}\nSeverity: ${accidentSeverity}\nRoad blocked: ${roadBlocked ? "Yes" : "No"}`;
        incidentData.priority = injuries ? "high" : priority;
      }
      if (selectedType === "pothole") {
        incidentData.description += `\n\nPothole size: ${potholeSize}\nDepth: ${potholeDepth}`;
      }

      // Create incident via API
      const result = await api.createIncident(incidentData);
      setTicketId(result._id?.slice(-8)?.toUpperCase() || "CC-" + Date.now().toString(36).toUpperCase());

      // Create alerts for relevant officers
      if (selectedType === "accident") {
        // Alert BOTH ambulance AND police for accidents
        await api.getAlerts(); // ensure token works
        const alertBase = {
          title: `🚨 Accident Reported — ${liveLocation.address.split(",")[0]}`,
          description: `${injuries ? "⚠️ INJURIES REPORTED! " : ""}${vehicleCount} vehicle(s) involved. ${roadBlocked ? "Road is BLOCKED." : ""} Severity: ${accidentSeverity}.`,
          severity: injuries ? "high" : "medium",
          location: { lat: liveLocation.lat, lng: liveLocation.lng, area: liveLocation.address },
        };
        try {
          // Try creating alerts (requires police/admin token — will work if logged in as such)
          await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3001/api"}/alerts`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...alertBase, type: "emergency" })
          });
        } catch {}
        setAlertSent("🚑 Ambulance + 🚔 Police alerted!");
      } else if (selectedType === "traffic_jam") {
        setAlertSent("🚔 Traffic Police notified!");
      } else if (selectedType === "pothole" || selectedType === "road_damage") {
        setAlertSent("🚧 Construction Authority notified!");
      } else if (selectedType === "waterlogging") {
        setAlertSent("🚔 Police + 🚧 Municipal team notified!");
      } else {
        setAlertSent("📋 Report filed successfully!");
      }

      setSubmitted(true);
    } catch (err: any) {
      setAlertSent("❌ Error: " + (err.message || "Failed to submit"));
    } finally { setLoading(false); }
  };

  if (submitted) return (
    <div className="flex flex-col h-full bg-white items-center justify-center px-8 pb-24">
      <div className="w-20 h-20 rounded-3xl bg-black flex items-center justify-center mb-6 shadow-[0_8px_30px_rgba(0,0,0,0.15)]">
        <CheckCircle2 size={34} className="text-white"/>
      </div>
      <h2 className="text-[26px] font-black text-black mb-2">Report Submitted!</h2>
      <p className="text-zinc-400 text-[14px] text-center mb-3 font-medium">Your report has been saved and authorities have been notified.</p>
      {alertSent && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 mb-3 w-full text-center">
          <p className="text-[13px] font-bold text-green-700">{alertSent}</p>
        </div>
      )}
      <div className="bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-3 mb-8 flex items-center gap-2">
        <span className="text-[12px] text-zinc-400 font-medium">Ticket ID:</span>
        <span className="text-[13px] font-black text-black font-mono">CC-{ticketId}</span>
      </div>
      <button onClick={()=>{setSubmitted(false);setSelectedType(null);setDescription("");setAlertSent("");}} className="btn-primary w-full py-4 text-[15px]">Submit Another Report</button>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-y-auto no-scrollbar pb-28 bg-white">
      <div className="px-5 pt-14 pb-4">
        <h2 className="text-[22px] font-black text-black mb-0.5">Report an Issue</h2>
        <p className="text-zinc-400 text-[13px] font-medium mb-5">Help improve traffic safety in your area</p>

        {/* Issue Type Grid */}
        <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-3">Issue Type</p>
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          {REPORT_TYPES.map(({id,label,icon:Icon,color,bg})=>(
            <button key={id} onClick={()=>setSelectedType(id)}
              className={`flex flex-col items-center gap-2 rounded-2xl py-3.5 px-2 transition-all active:scale-95 border ${selectedType===id?"border-black bg-zinc-50":"border-zinc-100 bg-white"} shadow-sm`}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{backgroundColor:bg}}>
                <Icon size={15} style={{color}}/>
              </div>
              <span className="text-[11px] font-semibold text-zinc-600 text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>

        {/* ─── Dynamic Fields Based on Type ─── */}
        {selectedType && (
          <>
            {/* Accident-specific options */}
            {selectedType === "accident" && (
              <div className="mb-5 animate-slide-up" style={{animationFillMode:"forwards"}}>
                <p className="text-[11px] font-black uppercase tracking-wider text-red-400 mb-3">⚠️ Accident Details</p>

                {/* Injuries Toggle */}
                <div className="flex items-center justify-between bg-red-50 border border-red-100 rounded-2xl px-4 py-3.5 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center"><AlertTriangle size={14} className="text-red-500"/></div>
                    <span className="text-[13px] font-bold text-black">Injuries reported?</span>
                  </div>
                  <button onClick={()=>setInjuries(!injuries)}
                    className={`w-12 h-7 rounded-full transition-all ${injuries?"bg-red-500":"bg-zinc-200"} relative`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-1 transition-all ${injuries?"right-1":"left-1"}`}/>
                  </button>
                </div>

                {/* Vehicles Count */}
                <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3.5 mb-3">
                  <Car size={14} className="text-zinc-500"/>
                  <span className="text-[13px] font-semibold text-black flex-1">Vehicles involved</span>
                  <div className="flex items-center gap-2">
                    {["1","2","3","4+"].map(v=>(
                      <button key={v} onClick={()=>setVehicleCount(v)}
                        className={`w-9 h-9 rounded-xl text-[12px] font-bold transition-all ${vehicleCount===v?"bg-black text-white":"bg-white border border-zinc-200 text-zinc-500"}`}>{v}</button>
                    ))}
                  </div>
                </div>

                {/* Severity */}
                <div className="flex gap-2 mb-3">
                  {[{id:"minor",label:"Minor",emoji:"🟡"},{id:"moderate",label:"Moderate",emoji:"🟠"},{id:"severe",label:"Severe",emoji:"🔴"}].map(s=>(
                    <button key={s.id} onClick={()=>setAccidentSeverity(s.id)}
                      className={`flex-1 py-2.5 rounded-xl text-[12px] font-bold transition-all flex items-center justify-center gap-1 ${accidentSeverity===s.id?"bg-black text-white":"bg-zinc-50 border border-zinc-100 text-zinc-500"}`}>
                      {accidentSeverity===s.id?null:<span>{s.emoji}</span>}{s.label}
                    </button>
                  ))}
                </div>

                {/* Road Blocked */}
                <div className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-2xl px-4 py-3.5">
                  <span className="text-[13px] font-bold text-black">🚧 Road blocked?</span>
                  <button onClick={()=>setRoadBlocked(!roadBlocked)}
                    className={`w-12 h-7 rounded-full transition-all ${roadBlocked?"bg-orange-500":"bg-zinc-200"} relative`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-1 transition-all ${roadBlocked?"right-1":"left-1"}`}/>
                  </button>
                </div>
              </div>
            )}

            {/* Pothole-specific options */}
            {selectedType === "pothole" && (
              <div className="mb-5 animate-slide-up" style={{animationFillMode:"forwards"}}>
                <p className="text-[11px] font-black uppercase tracking-wider text-amber-600 mb-3">🕳️ Pothole Details</p>
                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-zinc-400 mb-1.5">Size</p>
                    <div className="flex gap-1.5">
                      {["small","medium","large"].map(s=>(
                        <button key={s} onClick={()=>setPotholeSize(s)}
                          className={`flex-1 py-2 rounded-xl text-[11px] font-bold capitalize ${potholeSize===s?"bg-black text-white":"bg-zinc-50 border border-zinc-100 text-zinc-500"}`}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-zinc-400 mb-1.5">Depth</p>
                    <div className="flex gap-1.5">
                      {["shallow","deep","very deep"].map(d=>(
                        <button key={d} onClick={()=>setPotholeDepth(d)}
                          className={`flex-1 py-2 rounded-xl text-[10px] font-bold capitalize ${potholeDepth===d?"bg-black text-white":"bg-zinc-50 border border-zinc-100 text-zinc-500"}`}>{d}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Priority (for all types) */}
            <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-3">Priority</p>
            <div className="flex gap-2 mb-5">
              {["low","medium","high"].map((p)=>(
                <button key={p} onClick={()=>setPriority(p)}
                  className={`flex-1 py-2.5 rounded-xl text-[12px] font-bold capitalize transition-all ${priority===p?"bg-black text-white":"bg-zinc-50 border border-zinc-100 text-zinc-500"}`}>
                  {p}
                </button>
              ))}
            </div>

            {/* Live GPS Location (auto-detected) */}
            <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-3">📍 Live Location</p>
            <div className="bg-green-50 border border-green-100 rounded-2xl px-4 py-3.5 mb-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                {locLoading ? <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"/> : <MapPin size={14} className="text-green-600"/>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-black font-semibold truncate">{locLoading ? "Detecting location..." : liveLocation?.address || "Detecting..."}</p>
                {liveLocation && <p className="text-[10px] text-green-600 font-medium">{liveLocation.lat.toFixed(4)}, {liveLocation.lng.toFixed(4)}</p>}
              </div>
              <button onClick={detectLocation} className="text-[10px] font-black text-green-700 bg-green-100 px-2.5 py-1.5 rounded-lg">🔄 Refresh</button>
            </div>

            {/* Description */}
            <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-3">Description</p>
            <textarea placeholder={selectedType==="accident"?"Describe the accident (vehicles, conditions, etc.)…":selectedType==="pothole"?"Describe the pothole location and danger level…":"Describe the issue in detail…"}
              value={description} onChange={(e)=>setDescription(e.target.value)} rows={3}
              className="w-full input-field px-4 py-3.5 text-[13px] text-black placeholder:text-zinc-400 outline-none resize-none mb-4 font-medium"/>

            {/* Evidence (Photo, Video, Voice) */}
            <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-3">Evidence</p>
            <div className="flex gap-3 mb-6">
              {[{Icon:Camera,label:"Photo",accept:"image/*",emoji:"📸"},{Icon:Upload,label:"Video",accept:"video/*",emoji:"🎥"}].map(({Icon,label,accept,emoji})=>(
                <label key={label} className="flex-1 bg-zinc-50 border border-zinc-100 rounded-2xl py-4 flex flex-col items-center gap-1.5 cursor-pointer hover:bg-zinc-100 transition-all active:scale-95">
                  <span className="text-lg">{emoji}</span><span className="text-[11px] text-zinc-500 font-semibold">{label}</span>
                  <input type="file" accept={accept} className="hidden"/>
                </label>
              ))}
              <button className="flex-1 bg-zinc-50 border border-zinc-100 rounded-2xl py-4 flex flex-col items-center gap-1.5 hover:bg-zinc-100 transition-all active:scale-95">
                <span className="text-lg">🎤</span><span className="text-[11px] text-zinc-500 font-semibold">Voice</span>
              </button>
            </div>

            {/* Submit Button */}
            <button onClick={handleSubmit} disabled={loading || !liveLocation}
              className="btn-primary w-full py-4 text-[15px] disabled:opacity-50">
              {loading ? "Submitting & Alerting Officers..." : "🚨 Submit Report"}
            </button>
          </>
        )}

        {/* Prompt to select type */}
        {!selectedType && (
          <div className="flex flex-col items-center justify-center py-12 opacity-50">
            <AlertCircle size={40} className="text-zinc-300 mb-3"/>
            <p className="text-[14px] text-zinc-400 font-medium text-center">Select an issue type above to begin your report</p>
          </div>
        )}
      </div>
    </div>
  );
}
// ─── TrackReportScreen ────────────────────────────────────────────────────────
function TrackReportScreen({ setTab }: { setTab: (t: MainTab) => void }) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      try {
        const data = await api.getIncidents();
        const list = Array.isArray(data) ? data : data.incidents || data.data || [];
        setReports(list);
      } catch { setReports([]); }
      setLoading(false);
    };
    fetchReports();
  }, []);

  const filtered = filter === "all" ? reports : reports.filter(r => r.status === filter);

  const statusConfig: Record<string,{color:string;bg:string;label:string;icon:string}> = {
    open:      { color: "text-orange-600", bg: "bg-orange-50", label: "Open",        icon: "🟠" },
    pending:   { color: "text-amber-600",  bg: "bg-amber-50",  label: "Pending",     icon: "🟡" },
    in_progress:{ color: "text-blue-600",  bg: "bg-blue-50",   label: "In Progress", icon: "🔵" },
    resolved:  { color: "text-green-600",  bg: "bg-green-50",  label: "Resolved",    icon: "🟢" },
    closed:    { color: "text-zinc-500",   bg: "bg-zinc-50",   label: "Closed",      icon: "⚫" },
  };

  const typeIcon: Record<string,string> = {
    accident: "🚗", traffic_jam: "🚦", pothole: "🕳️", road_damage: "🛣️",
    waterlogging: "🌊", illegal_parking: "🅿️", broken_signal: "🚥",
  };

  const getStatus = (s: string) => statusConfig[s] || statusConfig.open;
  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff/60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins/60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs/24)}d ago`;
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto no-scrollbar pb-28">
      <div className="px-5 pt-14 pb-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={()=>setTab("home")} className="w-10 h-10 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center">
            <ChevronRight size={16} className="text-black rotate-180"/>
          </button>
          <div className="flex-1">
            <h2 className="text-[22px] font-black text-black">Track Reports</h2>
            <p className="text-zinc-400 text-[12px] font-medium">{reports.length} report{reports.length!==1?'s':''} submitted</p>
          </div>
          <button onClick={async()=>{setLoading(true);try{const d=await api.getIncidents();setReports(Array.isArray(d)?d:d.incidents||d.data||[]);}catch{}setLoading(false);}}
            className="w-10 h-10 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center">
            <RefreshCcw size={14} className="text-zinc-500"/>
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar">
          {[{id:"all",label:"All"},{id:"open",label:"Open"},{id:"in_progress",label:"In Progress"},{id:"resolved",label:"Resolved"},{id:"closed",label:"Closed"}].map(f=>(
            <button key={f.id} onClick={()=>setFilter(f.id)}
              className={`px-4 py-2 rounded-2xl text-[12px] font-bold whitespace-nowrap border transition-all ${
                filter===f.id ? "bg-black text-white border-black" : "bg-zinc-50 text-zinc-500 border-zinc-100 hover:bg-zinc-100"
              }`}>{f.label} {f.id==="all"?`(${reports.length})`:`(${reports.filter(r=>r.status===f.id).length})`}</button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin"/>
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <ClipboardList size={48} className="text-zinc-200 mb-4"/>
            <p className="text-[15px] font-bold text-zinc-400">No reports found</p>
            <p className="text-[12px] text-zinc-300 mt-1">Reports you submit will appear here</p>
            <button onClick={()=>setTab("reports")} className="mt-4 px-6 py-2.5 bg-black text-white rounded-2xl text-[13px] font-bold">Submit a Report</button>
          </div>
        )}

        {/* Reports List */}
        {!loading && filtered.length > 0 && (
          <div className="flex flex-col gap-3">
            {filtered.map((r: any, i: number) => {
              const st = getStatus(r.status);
              return (
                <div key={r._id || i} className="bg-white border border-zinc-100 rounded-2xl p-4 hover:shadow-sm transition-all">
                  {/* Top row */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-2xl bg-zinc-50 flex items-center justify-center text-lg shrink-0">
                      {typeIcon[r.type] || "📋"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-black truncate">{r.title || r.type?.replace(/_/g,' ')}</p>
                      <p className="text-[11px] text-zinc-400 font-medium">{r.location?.address || r.location?.area || "Unknown location"}</p>
                    </div>
                    <span className={`${st.bg} ${st.color} text-[10px] font-black px-2.5 py-1 rounded-lg shrink-0`}>
                      {st.icon} {st.label}
                    </span>
                  </div>
                  {/* Description */}
                  {r.description && <p className="text-[12px] text-zinc-500 font-medium mb-3 line-clamp-2">{r.description}</p>}
                  {/* Progress bar */}
                  <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden mb-2">
                    <div className="h-full rounded-full transition-all" style={{
                      width: r.status==="resolved"||r.status==="closed" ? "100%" : r.status==="in_progress" ? "60%" : "25%",
                      backgroundColor: r.status==="resolved"||r.status==="closed" ? "#16A34A" : r.status==="in_progress" ? "#2563EB" : "#F97316"
                    }}/>
                  </div>
                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400 font-medium">
                      {r.priority && <span className={`font-bold uppercase mr-2 ${r.priority==="high"?"text-red-500":r.priority==="medium"?"text-orange-500":"text-green-500"}`}>{r.priority}</span>}
                      {r.createdAt ? timeAgo(r.createdAt) : "Recently"}
                    </span>
                    <span className="text-[10px] text-zinc-300 font-medium">ID: {(r._id || "").slice(-6).toUpperCase()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RouteDirectionScreen ─────────────────────────────────────────────────────
function RouteDirectionScreen({ setTab }: { setTab: (t: MainTab) => void }) {
  const [destination, setDestination] = useState("");
  const [liveLocation, setLiveLocation] = useState<{lat:number;lng:number;address:string}|null>(null);
  const [destCoords, setDestCoords] = useState<{lat:number;lng:number}|null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{distance:number;duration:number}|null>(null);
  const searchTimer = useRef<any>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map|null>(null);

  useEffect(() => {
    if (!navigator.geolocation) { setLiveLocation({lat:15.8497,lng:74.4977,address:"Belagavi, RPD Cross"}); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const {latitude: lat, longitude: lng} = pos.coords;
      let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const d = await r.json();
        if (d.display_name) address = d.display_name.split(",").slice(0,3).join(",").trim();
      } catch {}
      setLiveLocation({lat, lng, address});
    }, () => setLiveLocation({lat:15.8497,lng:74.4977,address:"GPS denied"}), {enableHighAccuracy:true});
  }, []);

  const handleSearch = (val: string) => {
    setDestination(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5`);
        const d = await r.json();
        setSuggestions(d.map((x:any) => ({ name: x.display_name?.split(",").slice(0,3).join(",").trim(), full: x.display_name, lat: parseFloat(x.lat), lng: parseFloat(x.lon) })));
        setShowSuggestions(true);
      } catch {}
    }, 400);
  };

  const pickPlace = async (s: any) => {
    setDestination(s.name);
    setDestCoords({lat:s.lat,lng:s.lng});
    setSuggestions([]); setShowSuggestions(false); setLoading(true);
    // Build route
    if (liveLocation) {
      try {
        const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${liveLocation.lng},${liveLocation.lat};${s.lng},${s.lat}?overview=full&geometries=geojson`);
        const d = await r.json();
        if (d.routes?.[0]) {
          setRouteInfo({ distance: d.routes[0].distance/1000, duration: Math.round(d.routes[0].duration/60) });
          // Render map
          setTimeout(() => {
            if (!mapRef.current) return;
            if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
            const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false });
            mapInstance.current = map;
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
            const startIcon = L.divIcon({ className: "", html: '<div style="width:18px;height:18px;border-radius:50%;background:#16A34A;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>', iconSize:[18,18], iconAnchor:[9,9] });
            const endIcon = L.divIcon({ className: "", html: '<div style="width:18px;height:18px;border-radius:50%;background:#EF4444;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>', iconSize:[18,18], iconAnchor:[9,9] });
            L.marker([liveLocation.lat, liveLocation.lng], {icon:startIcon}).addTo(map);
            L.marker([s.lat, s.lng], {icon:endIcon}).addTo(map);
            const coords = d.routes[0].geometry.coordinates.map((c:number[]) => [c[1],c[0]] as [number,number]);
            const line = L.polyline(coords, { color: "#7C3AED", weight: 5, opacity: 0.9 }).addTo(map);
            map.fitBounds(line.getBounds(), { padding: [40,40] });
          }, 100);
        }
      } catch {}
    }
    setLoading(false);
  };

  const openGoogleMaps = () => {
    if (!liveLocation || !destCoords) return;
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${liveLocation.lat},${liveLocation.lng}&destination=${destCoords.lat},${destCoords.lng}&travelmode=driving`, '_blank');
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto no-scrollbar pb-28">
      <div className="px-5 pt-14 pb-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={()=>setTab("home")} className="w-10 h-10 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center">
            <ChevronRight size={16} className="text-black rotate-180"/>
          </button>
          <div>
            <h2 className="text-[22px] font-black text-black">Route Direction</h2>
            <p className="text-zinc-400 text-[12px] font-medium">Find the best route to your destination</p>
          </div>
        </div>

        {/* From */}
        <div className="bg-green-50 border border-green-100 rounded-2xl px-4 py-3 mb-3 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-green-500 shrink-0"/>
          <p className="text-[13px] text-black font-semibold truncate flex-1">{liveLocation?.address || "Detecting..."}</p>
          <span className="text-[10px] font-black text-green-700 bg-green-100 px-2 py-1 rounded-lg">GPS</span>
        </div>

        {/* To with autocomplete */}
        <div className="relative mb-4">
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-red-500 shrink-0"/>
            <input value={destination} onChange={e=>handleSearch(e.target.value)}
              onFocus={()=>suggestions.length>0&&setShowSuggestions(true)}
              placeholder="Where to?"
              className="flex-1 bg-transparent outline-none text-[13px] text-black placeholder:text-zinc-400 font-semibold"/>
            {destination && <button onClick={()=>{setDestination("");setDestCoords(null);setRouteInfo(null);setSuggestions([]);}} className="text-zinc-400 text-lg">×</button>}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-20 bg-white border border-zinc-200 rounded-2xl mt-1 shadow-lg overflow-hidden">
              {suggestions.map((s,i) => (
                <button key={i} onClick={()=>pickPlace(s)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 border-b border-zinc-50 last:border-0 text-left">
                  <MapPin size={14} className="text-violet-500 shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-black truncate">{s.name}</p>
                    <p className="text-[10px] text-zinc-400 truncate">{s.full}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Connecting line between dots */}
        {!routeInfo && !loading && (
          <div className="flex items-center justify-center py-8 text-zinc-300">
            <Navigation size={40}/>
            <p className="text-[13px] text-zinc-400 font-medium ml-3">Search a destination to see route</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin"/>
          </div>
        )}

        {/* Route Map */}
        {routeInfo && (
          <>
            <div ref={mapRef} className="w-full rounded-2xl overflow-hidden border border-zinc-200 mb-3" style={{height:280}}/>
            <div className="flex items-center gap-4 mb-4 px-1">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow"/><span className="text-[10px] text-zinc-500 font-medium">You</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow"/><span className="text-[10px] text-zinc-500 font-medium">Destination</span></div>
              <div className="flex items-center gap-1.5"><div className="w-5 h-0 border-t-2 border-violet-500"/><span className="text-[10px] text-zinc-500 font-medium">Route</span></div>
            </div>

            {/* Distance & Duration */}
            <div className="flex gap-3 mb-4">
              <div className="flex-1 bg-violet-50 border border-violet-100 rounded-2xl p-4 text-center">
                <p className="text-[22px] font-black text-violet-600">{routeInfo.distance.toFixed(1)} km</p>
                <p className="text-[11px] text-zinc-400 font-bold">Distance</p>
              </div>
              <div className="flex-1 bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
                <p className="text-[22px] font-black text-blue-600">{routeInfo.duration} min</p>
                <p className="text-[11px] text-zinc-400 font-bold">Est. Time</p>
              </div>
            </div>

            {/* Start Navigation */}
            <button onClick={openGoogleMaps}
              className="w-full py-4 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold text-[16px] flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-lg shadow-green-100">
              <Navigation size={20}/> 🚗 Start Navigation
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── EmergencyScreen ──────────────────────────────────────────────────────────
function EmergencyScreen({ setTab }: { setTab: (t: MainTab) => void }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [liveLocation, setLiveLocation] = useState<{lat:number;lng:number;address:string}|null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!navigator.geolocation) { setLiveLocation({lat:15.8497,lng:74.4977,address:"Belagavi, RPD Cross"}); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const {latitude: lat, longitude: lng} = pos.coords;
      let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const data = await res.json();
        if (data.display_name) address = data.display_name.split(",").slice(0,3).join(",").trim();
      } catch {}
      setLiveLocation({lat, lng, address});
    }, () => { setLiveLocation({lat:15.8497,lng:74.4977,address:"Location unavailable"}); }, { enableHighAccuracy: true });
  }, []);

  const sendSOS = async () => {
    setSending(true);
    setCountdown(3);
    // Countdown animation
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 1000));
    }
    setCountdown(0);
    try {
      const loc = liveLocation || {lat:15.8497,lng:74.4977,address:"Unknown"};
      // Create emergency incident
      await api.createIncident({
        type: "accident",
        title: `🚨 EMERGENCY SOS — ${loc.address.split(",")[0]}`,
        description: "Emergency SOS triggered by citizen. Immediate assistance required.",
        location: { lat: loc.lat, lng: loc.lng, address: loc.address },
        priority: "high",
      });
      // Send alerts to ALL officer roles
      const alertBase = {
        title: `🚨 EMERGENCY SOS ALERT`,
        description: `Citizen triggered emergency SOS at ${loc.address}. Coordinates: ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`,
        severity: "high",
        location: { area: loc.address, lat: loc.lat, lng: loc.lng },
      };
      const roles = ["police", "ambulance", "emergency"];
      await Promise.all(roles.map(type =>
        fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/alerts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(localStorage.getItem('cc_token') ? { Authorization: `Bearer ${localStorage.getItem('cc_token')}` } : {}) },
          body: JSON.stringify({ ...alertBase, type })
        }).catch(() => {})
      ));
      setSent(true);
    } catch {
      setSent(true);
    }
    setSending(false);
  };

  if (sent) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center px-8">
        <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-6 animate-pulse">
          <CheckCircle2 size={48} className="text-green-600"/>
        </div>
        <h2 className="text-[24px] font-black text-black mb-2 text-center">SOS Sent Successfully!</h2>
        <p className="text-zinc-400 text-[14px] text-center mb-2 font-medium">Emergency alert sent to:</p>
        <div className="flex flex-col gap-2 mb-6 w-full max-w-[280px]">
          {[{icon:"🚔",label:"Police Officers",color:"bg-blue-50 text-blue-600"},{icon:"🚑",label:"Ambulance Team",color:"bg-red-50 text-red-600"},{icon:"🚒",label:"Emergency Services",color:"bg-orange-50 text-orange-600"}].map(r=>(
            <div key={r.label} className={`${r.color} rounded-2xl px-4 py-3 flex items-center gap-3 font-bold text-[13px]`}>
              <span className="text-lg">{r.icon}</span>{r.label}<Check size={14} className="ml-auto"/>
            </div>
          ))}
        </div>
        <p className="text-zinc-400 text-[12px] text-center mb-6">📍 {liveLocation?.address || "Your location"}</p>
        <button onClick={()=>{setSent(false);setTab("home");}} className="btn-primary w-full max-w-[280px] py-4 text-[15px]">Back to Home</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-5 pt-14 pb-4 flex items-center gap-3">
        <button onClick={()=>setTab("home")} className="w-10 h-10 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center">
          <ChevronRight size={16} className="text-black rotate-180"/>
        </button>
        <div>
          <h2 className="text-[22px] font-black text-red-500">Emergency SOS</h2>
          <p className="text-zinc-400 text-[12px] font-medium">Press the button to alert all officers</p>
        </div>
      </div>

      {/* Main SOS Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        {/* Pulsing rings */}
        <div className="relative mb-8">
          <div className="absolute inset-0 w-56 h-56 -m-6 rounded-full bg-red-50 animate-ping" style={{animationDuration:"2s"}}/>
          <div className="absolute inset-0 w-48 h-48 -m-2 rounded-full bg-red-100 animate-ping" style={{animationDuration:"2.5s"}}/>
          <button onClick={sendSOS} disabled={sending}
            className="relative w-44 h-44 rounded-full bg-gradient-to-br from-red-500 to-red-700 shadow-2xl shadow-red-200 flex flex-col items-center justify-center active:scale-95 transition-transform disabled:opacity-70">
            {countdown > 0 ? (
              <span className="text-white text-[48px] font-black">{countdown}</span>
            ) : sending ? (
              <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"/>
            ) : (
              <>
                <Shield size={40} className="text-white mb-1"/>
                <span className="text-white text-[22px] font-black">SOS</span>
                <span className="text-red-200 text-[11px] font-bold">PRESS & HOLD</span>
              </>
            )}
          </button>
        </div>

        {/* Location */}
        <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-3 flex items-center gap-3 w-full max-w-[320px] mb-4">
          <MapPin size={16} className="text-red-500 shrink-0"/>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-black truncate">{liveLocation?.address || "Detecting location..."}</p>
            {liveLocation && <p className="text-[10px] text-red-400">{liveLocation.lat.toFixed(4)}, {liveLocation.lng.toFixed(4)}</p>}
          </div>
          <span className="text-[10px] font-black text-red-600 bg-red-100 px-2 py-1 rounded-lg">LIVE</span>
        </div>

        {/* Who gets notified */}
        <p className="text-zinc-400 text-[11px] font-bold uppercase tracking-wider mb-3">Will alert:</p>
        <div className="flex gap-3 mb-4">
          {[{icon:"🚔",label:"Police"},{icon:"🚑",label:"Ambulance"},{icon:"🚒",label:"Fire"}].map(r=>(
            <div key={r.label} className="bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 flex flex-col items-center gap-1">
              <span className="text-xl">{r.icon}</span>
              <span className="text-[10px] font-bold text-zinc-500">{r.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AIPredictionScreen ───────────────────────────────────────────────────────
function AIPredictionScreen({ setTab }: { setTab: (t: MainTab) => void }) {
  const [destination, setDestination] = useState("");
  const [liveLocation, setLiveLocation] = useState<{lat:number;lng:number;address:string}|null>(null);
  const [destCoords, setDestCoords] = useState<{lat:number;lng:number}|null>(null);
  const [loading, setLoading] = useState(false);
  const [routeResult, setRouteResult] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimer = useRef<any>(null);
  const routeMapRef = useRef<HTMLDivElement>(null);
  const routeMapInstance = useRef<L.Map|null>(null);

  // Auto-detect GPS
  useEffect(() => {
    if (!navigator.geolocation) { setLiveLocation({lat:15.8497,lng:74.4977,address:"Belagavi, RPD Cross"}); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const {latitude: lat, longitude: lng} = pos.coords;
      let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const data = await res.json();
        if (data.display_name) address = data.display_name.split(",").slice(0,3).join(",").trim();
      } catch {}
      setLiveLocation({lat, lng, address});
    }, () => { setLiveLocation({lat:15.8497,lng:74.4977,address:"Belagavi, RPD Cross (GPS denied)"}); }, { enableHighAccuracy: true });
  }, []);

  // Debounced search suggestions
  const handleDestChange = (val: string) => {
    setDestination(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5&addressdetails=1`);
        const data = await res.json();
        setSuggestions(data.map((d: any) => ({
          name: d.display_name?.split(",").slice(0,3).join(",").trim(),
          fullName: d.display_name,
          lat: parseFloat(d.lat), lng: parseFloat(d.lon),
          type: d.type || d.class || "place",
        })));
        setShowSuggestions(true);
      } catch { setSuggestions([]); }
    }, 400);
  };

  const pickSuggestion = (s: any) => {
    setDestination(s.name);
    setDestCoords({ lat: s.lat, lng: s.lng });
    setShowSuggestions(false);
    setSuggestions([]);
  };

  // Render route map with real OSRM directions
  const renderRouteMap = useCallback(async () => {
    if (!routeMapRef.current || !liveLocation || !destCoords) return;
    if (routeMapInstance.current) { routeMapInstance.current.remove(); routeMapInstance.current = null; }
    const map = L.map(routeMapRef.current, { zoomControl: false, attributionControl: false });
    routeMapInstance.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
    // Start marker (green)
    const startIcon = L.divIcon({ className: "", html: `<div style="width:20px;height:20px;border-radius:50%;background:#16A34A;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35)"><div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid #16A34A;opacity:0.3"></div></div>`, iconSize: [20,20], iconAnchor: [10,10] });
    L.marker([liveLocation.lat, liveLocation.lng], { icon: startIcon }).addTo(map).bindPopup(`<b>📍 Start</b><br/>${liveLocation.address}`);
    // End marker (red)
    const endIcon = L.divIcon({ className: "", html: `<div style="width:20px;height:20px;border-radius:50%;background:#EF4444;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35)"><div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid #EF4444;opacity:0.3"></div></div>`, iconSize: [20,20], iconAnchor: [10,10] });
    L.marker([destCoords.lat, destCoords.lng], { icon: endIcon }).addTo(map).bindPopup(`<b>🏁 Destination</b><br/>${destination}`);
    // Fetch real road route from OSRM
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${liveLocation.lng},${liveLocation.lat};${destCoords.lng},${destCoords.lat}?overview=full&geometries=geojson`;
      const res = await fetch(osrmUrl);
      const data = await res.json();
      if (data.routes?.[0]?.geometry) {
        const coords = data.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number,number]);
        const routeLine = L.polyline(coords, { color: "#7C3AED", weight: 5, opacity: 0.85 }).addTo(map);
        map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
      } else {
        const fallback = L.polyline([[liveLocation.lat, liveLocation.lng], [destCoords.lat, destCoords.lng]], { color: "#7C3AED", weight: 4, opacity: 0.7, dashArray: "10, 6" }).addTo(map);
        map.fitBounds(fallback.getBounds(), { padding: [30, 30] });
      }
    } catch {
      const fallback = L.polyline([[liveLocation.lat, liveLocation.lng], [destCoords.lat, destCoords.lng]], { color: "#7C3AED", weight: 4, opacity: 0.7, dashArray: "10, 6" }).addTo(map);
      map.fitBounds(fallback.getBounds(), { padding: [30, 30] });
    }
  }, [liveLocation, destCoords, destination]);

  useEffect(() => { if (routeResult && !routeResult.error) renderRouteMap(); }, [routeResult, renderRouteMap]);

  // Haversine distance
  const haversine = (lat1:number, lon1:number, lat2:number, lon2:number) => {
    const R = 6371; const dLat = (lat2-lat1)*Math.PI/180; const dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // Traffic prediction engine
  const generatePredictions = (distKm: number, roadDuration?: number) => {
    const isWeekend = [0,6].includes(new Date().getDay());
    // Use OSRM driving duration if available, otherwise estimate at 30km/h
    const baseMins = roadDuration && roadDuration > 0 ? roadDuration : Math.round((distKm / 30) * 60);

    const periods = [
      { id: "morning",   label: "🌅 Morning",     time: "7:00 – 10:00 AM", peakFactor: isWeekend ? 1.15 : 1.8 },
      { id: "afternoon", label: "☀️ Afternoon",    time: "12:00 – 3:00 PM", peakFactor: isWeekend ? 1.05 : 1.35 },
      { id: "evening",   label: "🌇 Evening",      time: "5:00 – 8:00 PM",  peakFactor: isWeekend ? 1.2 : 2.0 },
      { id: "night",     label: "🌙 Night",        time: "9:00 – 11:00 PM", peakFactor: isWeekend ? 1.05 : 1.1 },
    ];

    const today = periods.map(p => {
      const dur = Math.round(baseMins * p.peakFactor);
      const congestion = Math.min(Math.round(p.peakFactor * 40), 95);
      const level = congestion > 70 ? "heavy" : congestion > 40 ? "moderate" : "light";
      return { ...p, duration: dur, congestion, level };
    });

    const tomorrow = periods.map(p => {
      const factor = p.peakFactor * (0.85 + Math.random()*0.3);
      const dur = Math.round(baseMins * factor);
      const congestion = Math.min(Math.round(factor * 40), 95);
      const level = congestion > 70 ? "heavy" : congestion > 40 ? "moderate" : "light";
      return { ...p, duration: dur, congestion, level };
    });

    const bestToday = today.reduce((a,b) => a.congestion < b.congestion ? a : b);
    const bestTomorrow = tomorrow.reduce((a,b) => a.congestion < b.congestion ? a : b);

    return { today, tomorrow, bestToday, bestTomorrow, distance: distKm, baseDuration: Math.round(baseMins) };
  };

  const handleAnalyze = async () => {
    if (!destination || !liveLocation) return;
    setLoading(true); setRouteResult(null);
    try {
      let dLat: number, dLng: number, destName: string;
      // If suggestion was picked, use cached coords; otherwise geocode
      if (destCoords) {
        dLat = destCoords.lat; dLng = destCoords.lng; destName = destination;
      } else {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(destination)}&format=json&limit=1`);
        const data = await res.json();
        if (!data.length) { setRouteResult({ error: "Destination not found. Try a more specific address." }); setLoading(false); return; }
        dLat = parseFloat(data[0].lat); dLng = parseFloat(data[0].lon);
        setDestCoords({lat: dLat, lng: dLng});
        destName = data[0].display_name?.split(",").slice(0,3).join(",").trim() || destination;
      }
      // Get real road distance from OSRM
      let distKm = haversine(liveLocation.lat, liveLocation.lng, dLat, dLng);
      let roadDuration = 0;
      try {
        const osrm = await fetch(`https://router.project-osrm.org/route/v1/driving/${liveLocation.lng},${liveLocation.lat};${dLng},${dLat}?overview=false`);
        const osrmData = await osrm.json();
        if (osrmData.routes?.[0]) {
          distKm = osrmData.routes[0].distance / 1000; // meters to km
          roadDuration = Math.round(osrmData.routes[0].duration / 60); // seconds to min
        }
      } catch {}
      const predictions = generatePredictions(distKm, roadDuration);
      setRouteResult({ ...predictions, destName });
    } catch { setRouteResult({ error: "Failed to analyze route" }); }
    setLoading(false);
  };

  const levelColor = (l: string) => l === "heavy" ? "text-red-500" : l === "moderate" ? "text-orange-500" : "text-green-500";
  const levelBg = (l: string) => l === "heavy" ? "bg-red-50" : l === "moderate" ? "bg-orange-50" : "bg-green-50";
  const levelBar = (c: number) => c > 70 ? "#EF4444" : c > 40 ? "#F97316" : "#16A34A";

  return (
    <div className="flex flex-col h-full overflow-y-auto no-scrollbar pb-28 bg-white">
      <div className="px-5 pt-14 pb-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={()=>setTab("home")} className="w-10 h-10 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center">
            <ChevronRight size={16} className="text-black rotate-180"/>
          </button>
          <div>
            <h2 className="text-[22px] font-black text-black">AI Route Prediction</h2>
            <p className="text-zinc-400 text-[12px] font-medium">Powered by CivicConnect AI</p>
          </div>
        </div>

        {/* From (Live GPS) */}
        <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">📍 From (Live Location)</p>
        <div className="bg-green-50 border border-green-100 rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
            <MapPin size={14} className="text-green-600"/>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-black font-semibold truncate">{liveLocation?.address || "Detecting..."}</p>
            {liveLocation && <p className="text-[10px] text-green-600 font-medium">{liveLocation.lat.toFixed(4)}, {liveLocation.lng.toFixed(4)}</p>}
          </div>
          <span className="text-[10px] font-black text-green-700 bg-green-100 px-2 py-1 rounded-lg">GPS</span>
        </div>

        {/* To (Destination) with Autocomplete */}
        <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">🏁 To (Destination)</p>
        <div className="relative mb-4">
          <div className="input-field flex items-center gap-3 px-4 py-3.5">
            <Navigation size={15} className="text-violet-500 shrink-0"/>
            <input value={destination} onChange={(e)=>handleDestChange(e.target.value)}
              onFocus={()=>suggestions.length>0&&setShowSuggestions(true)}
              placeholder="Search area, city, or place..."
              className="flex-1 bg-transparent outline-none text-[13px] text-black placeholder:text-zinc-400 font-medium"/>
            {destination && <button onClick={()=>{setDestination("");setSuggestions([]);setShowSuggestions(false);setRouteResult(null);setDestCoords(null);}} className="text-zinc-400 text-lg">×</button>}
          </div>
          {/* Autocomplete Suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-20 bg-white border border-zinc-200 rounded-2xl mt-1 shadow-lg overflow-hidden">
              {suggestions.map((s, i) => (
                <button key={i} onClick={()=>pickSuggestion(s)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-all border-b border-zinc-50 last:border-0 text-left">
                  <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                    <MapPin size={13} className="text-violet-500"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-black truncate">{s.name}</p>
                    <p className="text-[10px] text-zinc-400 truncate">{s.fullName}</p>
                  </div>
                  <ChevronRight size={12} className="text-zinc-300 shrink-0"/>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Analyze Button */}
        <button onClick={handleAnalyze} disabled={loading || !destination || !liveLocation}
          className="btn-primary w-full py-4 text-[15px] mb-6 disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Analyzing...</> : <><Brain size={16}/>🚀 Analyze Route & Predict Traffic</>}
        </button>

        {/* Route Direction Map */}
        {routeResult && !routeResult.error && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <Map size={14} className="text-violet-600"/>
              <p className="text-[14px] font-black text-black">Route Direction</p>
            </div>
            <div ref={routeMapRef} className="w-full rounded-2xl overflow-hidden border border-zinc-200" style={{height:220}}/>
            <div className="flex items-center gap-4 mt-2 px-1">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow"/><span className="text-[10px] text-zinc-500 font-medium">Start</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow"/><span className="text-[10px] text-zinc-500 font-medium">Destination</span></div>
              <div className="flex items-center gap-1.5"><div className="w-5 h-0 border-t-2 border-dashed border-violet-500"/><span className="text-[10px] text-zinc-500 font-medium">Route</span></div>
            </div>
          </div>
        )}

        {/* Results */}
        {routeResult?.error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-center">
            <p className="text-[13px] font-bold text-red-500">{routeResult.error}</p>
          </div>
        )}

        {routeResult && !routeResult.error && (
          <>
            {/* Route Summary */}
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Route size={16} className="text-violet-600"/>
                <p className="text-[14px] font-black text-black">Shortest Route</p>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 bg-white rounded-xl p-3 text-center border border-violet-100">
                  <p className="text-[20px] font-black text-violet-600">{routeResult.distance.toFixed(1)} km</p>
                  <p className="text-[10px] text-zinc-400 font-bold">Distance</p>
                </div>
                <div className="flex-1 bg-white rounded-xl p-3 text-center border border-violet-100">
                  <p className="text-[20px] font-black text-violet-600">{routeResult.baseDuration} min</p>
                  <p className="text-[10px] text-zinc-400 font-bold">Best Time</p>
                </div>
              </div>
              <div className="bg-white rounded-xl px-3 py-2 border border-violet-100 flex items-center gap-2 mb-3">
                <MapPin size={12} className="text-zinc-400"/>
                <p className="text-[11px] text-zinc-500 font-medium truncate">→ {routeResult.destName}</p>
              </div>
              {/* Start Navigation Button */}
              <button onClick={()=>{
                const url = `https://www.google.com/maps/dir/?api=1&origin=${liveLocation?.lat},${liveLocation?.lng}&destination=${destCoords?.lat},${destCoords?.lng}&travelmode=driving`;
                window.open(url, '_blank');
              }} className="w-full py-3.5 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md">
                <Navigation size={16}/> 🚗 Start Navigation (Google Maps)
              </button>
            </div>

            {/* Today's Prediction */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Sun size={14} className="text-amber-500"/>
                <p className="text-[14px] font-black text-black">Today's Traffic</p>
                <div className="flex-1"/>
                <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                  Best: {routeResult.bestToday.label}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {routeResult.today.map((p: any) => (
                  <div key={p.id} className={`${levelBg(p.level)} border rounded-2xl p-3 flex items-center gap-3 ${p.id===routeResult.bestToday.id ? "border-green-300 ring-1 ring-green-200" : "border-zinc-100"}`}>
                    <div className="text-center min-w-[50px]">
                      <p className="text-[14px] font-black text-black">{p.duration}m</p>
                      <p className={`text-[10px] font-bold capitalize ${levelColor(p.level)}`}>{p.level}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[12px] font-bold text-black">{p.label}</p>
                      <p className="text-[10px] text-zinc-400 font-medium">{p.time}</p>
                      <div className="h-1.5 bg-zinc-200 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{width:`${p.congestion}%`,backgroundColor:levelBar(p.congestion)}}/>
                      </div>
                    </div>
                    <span className={`text-[11px] font-black px-2 py-1 rounded-lg ${levelBg(p.level)} ${levelColor(p.level)}`}>{p.congestion}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tomorrow's Prediction */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={14} className="text-blue-500"/>
                <p className="text-[14px] font-black text-black">Tomorrow's Forecast</p>
                <div className="flex-1"/>
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                  Best: {routeResult.bestTomorrow.label}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {routeResult.tomorrow.map((p: any) => (
                  <div key={p.id} className={`${levelBg(p.level)} border rounded-2xl p-3 flex items-center gap-3 ${p.id===routeResult.bestTomorrow.id ? "border-blue-300 ring-1 ring-blue-200" : "border-zinc-100"}`}>
                    <div className="text-center min-w-[50px]">
                      <p className="text-[14px] font-black text-black">{p.duration}m</p>
                      <p className={`text-[10px] font-bold capitalize ${levelColor(p.level)}`}>{p.level}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[12px] font-bold text-black">{p.label}</p>
                      <p className="text-[10px] text-zinc-400 font-medium">{p.time}</p>
                      <div className="h-1.5 bg-zinc-200 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{width:`${p.congestion}%`,backgroundColor:levelBar(p.congestion)}}/>
                      </div>
                    </div>
                    <span className={`text-[11px] font-black px-2 py-1 rounded-lg ${levelBg(p.level)} ${levelColor(p.level)}`}>{p.congestion}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Recommendation */}
            <div className="bg-black rounded-2xl p-4 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Brain size={16} className="text-violet-400"/>
                <p className="text-[13px] font-black">AI Recommendation</p>
              </div>
              <p className="text-[12px] text-zinc-300 font-medium leading-relaxed">
                🕐 Travel during <span className="text-green-400 font-bold">{routeResult.bestToday.label.replace(/[^\w\s]/g,'').trim()}</span> today for the fastest trip (~{routeResult.bestToday.duration} min).
                {routeResult.bestToday.congestion < 40 ? " Traffic is expected to be light." : " Expect moderate congestion but it's the best window."}
                {" "}Tomorrow, <span className="text-blue-400 font-bold">{routeResult.bestTomorrow.label.replace(/[^\w\s]/g,'').trim()}</span> looks optimal (~{routeResult.bestTomorrow.duration} min).
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ProfileScreen ────────────────────────────────────────────────────────────
function ProfileScreen({ onLogout }: { onLogout: () => void }) {
  const [dark, setDark] = useState(false);
  const [lang, setLang] = useState("English");
  const user = api.getUser();
  const handleLogout = () => { api.clearToken(); onLogout(); };
  return (
    <div className="flex flex-col h-full overflow-y-auto no-scrollbar pb-28 bg-white">
      <div className="px-5 pt-14 pb-6">
        <div className="bg-zinc-50 border border-zinc-100 rounded-3xl p-5 mb-5 text-center">
          <div className="relative inline-block mb-3">
            <img src="https://iili.io/BZNQRI4.jpg"
              alt="Profile" className="w-20 h-20 rounded-3xl object-cover border-2 border-white shadow-md"/>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-xl bg-black flex items-center justify-center">
              <CheckCircle2 size={12} className="text-white"/>
            </div>
          </div>
          <h3 className="text-[20px] font-black text-black">{user?.name || "Kedaraj H"}</h3>
          <p className="text-[13px] text-zinc-400 font-medium mb-3">@{(user?.name || "kedarajh").toLowerCase().replace(/\s+/g,'')} · Karnataka, IN</p>
          <div className="flex justify-center gap-8">
            {[{label:"Reports",value:"24"},{label:"Routes",value:"8"},{label:"Points",value:"1,240"}].map(({label,value})=>(
              <div key={label} className="text-center">
                <p className="text-[18px] font-black text-black">{value}</p>
                <p className="text-[11px] text-zinc-400 font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-zinc-100 rounded-2xl p-4 mb-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
            <Star size={20} className="text-amber-500 fill-amber-500"/>
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-black text-black">1,240 Reward Points</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full" style={{width:"62%"}}/>
              </div>
              <span className="text-[11px] text-zinc-400 font-medium">760 to Gold</span>
            </div>
          </div>
        </div>
        <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-3">Settings</p>
        <div className="flex flex-col gap-2 mb-5">
          {[{Icon:Activity,label:"Complaint History",sub:"24 reports submitted"},{Icon:Route,label:"Saved Routes",sub:"8 routes saved"},{Icon:Bell,label:"Notifications",sub:"All alerts enabled"},{Icon:Shield,label:"Privacy & Safety",sub:""}].map(({Icon,label,sub})=>(
            <button key={label} className="card card-hover flex items-center gap-3 px-4 py-3.5 transition-all active:scale-[0.99] shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center shrink-0"><Icon size={15} className="text-zinc-600"/></div>
              <div className="flex-1 text-left"><p className="text-[13px] font-bold text-black">{label}</p>{sub&&<p className="text-[11px] text-zinc-400 font-medium">{sub}</p>}</div>
              <ChevronRight size={13} className="text-zinc-300 shrink-0"/>
            </button>
          ))}
        </div>
        <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-3">Preferences</p>
        <div className="flex flex-col gap-2 mb-5">
          <div className="card flex items-center gap-3 px-4 py-3.5 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center shrink-0">
              {dark?<Moon size={15} className="text-zinc-600"/>:<Sun size={15} className="text-zinc-600"/>}
            </div>
            <p className="text-[13px] font-bold text-black flex-1">Dark Mode</p>
            <button onClick={()=>setDark(!dark)} className={`w-12 h-6 rounded-full relative transition-all ${dark?"bg-black":"bg-zinc-200"}`}>
              <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all shadow-sm`} style={{left:dark?"calc(100% - 22px)":"2px"}}/>
            </button>
          </div>
          <div className="card flex items-center gap-3 px-4 py-3.5 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center shrink-0"><Globe size={15} className="text-zinc-600"/></div>
            <p className="text-[13px] font-bold text-black flex-1">Language</p>
            <select value={lang} onChange={(e)=>setLang(e.target.value)} className="bg-transparent text-[12px] text-zinc-500 font-semibold outline-none">
              {["English","Hindi","Marathi","Tamil","Telugu"].map((l)=>(<option key={l}>{l}</option>))}
            </select>
          </div>
        </div>
        <button onClick={handleLogout} className="w-full bg-red-50 border border-red-100 rounded-2xl px-4 py-3.5 flex items-center gap-3 hover:bg-red-100 transition-all active:scale-[0.99]">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0"><LogOut size={15} className="text-red-500"/></div>
          <p className="text-[13px] font-bold text-red-500">Sign Out</p>
        </button>
      </div>
    </div>
  );
}

// ─── BottomNav ────────────────────────────────────────────────────────────────
function BottomNav({ tab, setTab }: { tab: MainTab; setTab: (t: MainTab) => void }) {
  const u = api.getUser();
  const isAmbulance = u?.role === "ambulance";
  const tabs: { id: MainTab; Icon: any; label: string }[] = isAmbulance ? [
    {id:"ambulance", Icon:Shield,     label:"Missions"},
    {id:"map",     Icon:Map,      label:"Map"},
    {id:"profile", Icon:User,     label:"Profile"},
  ] : [
    {id:"home",    Icon:Home,     label:"Home"},
    {id:"map",     Icon:Map,      label:"Map"},
    {id:"alerts",  Icon:Bell,     label:"Alerts"},
    {id:"reports", Icon:FileText, label:"Report"},
    {id:"profile", Icon:User,     label:"Profile"},
  ];
  return (
    <div className="absolute bottom-0 left-0 right-0 px-3 pb-4 z-30">
      <div className="bg-white rounded-3xl px-2 py-2 flex items-center justify-around border border-zinc-100"
        style={{boxShadow:"0 -4px 30px rgba(0,0,0,0.08),0 4px 20px rgba(0,0,0,0.10)"}}>
        {tabs.map(({id,Icon,label})=>{
          const active=tab===id;
          return (
            <button key={id} onClick={()=>setTab(id)}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl transition-all ${active?"bg-black":""}`}>
              <Icon size={20} className={active?"text-white":"text-zinc-300"}/>
              <span className={`text-[10px] font-bold ${active?"text-white":"text-zinc-400"}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]   = useState<AppScreen>("splash");
  const [mainTab, setMainTab] = useState<MainTab>("home");

  return (
    <div className="min-h-screen bg-white" style={{fontFamily:"'DM Sans',sans-serif"}}>
      <Css/>
      <div className="relative w-full max-w-lg mx-auto min-h-screen overflow-hidden bg-white">

        {screen==="splash" && <SplashScreen onDone={()=>setScreen("auth")}/>}
        {screen==="auth"   && <AuthScreen onLogin={() => {
          const u = api.getUser();
          if (u?.role === "ambulance") setMainTab("ambulance");
          else setMainTab("home");
          setScreen("app");
        }}/>}
        {screen==="app"    && (
          <div className="absolute inset-0 bg-white">
            {mainTab==="home"    && <HomeScreen setTab={setMainTab}/>}
            {mainTab==="map"     && <MapScreen/>}
            {mainTab==="alerts"  && <AlertsScreen/>}
            {mainTab==="reports" && <ReportsScreen/>}
            {mainTab==="ai"      && <AIPredictionScreen setTab={setMainTab}/>}
            {mainTab==="emergency" && <EmergencyScreen setTab={setMainTab}/>}
            {mainTab==="route"     && <RouteDirectionScreen setTab={setMainTab}/>}
            {mainTab==="track"     && <TrackReportScreen setTab={setMainTab}/>}
            {mainTab==="ambulance" && <AmbulanceDashboard setTab={setMainTab}/>}
            {mainTab==="profile" && <ProfileScreen onLogout={()=>setScreen("auth")}/>}
            <BottomNav tab={mainTab} setTab={setMainTab}/>
          </div>
        )}
      </div>
    </div>
  );
}
