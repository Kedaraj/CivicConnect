import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Shield, AlertTriangle, Navigation, MapPin, CheckCircle2, Radio } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export function AmbulanceDashboard({ setTab }: { setTab: (t: any) => void }) {
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [liveLocation, setLiveLocation] = useState<{lat:number;lng:number;address:string}|null>(null);
  const [activeEmergency, setActiveEmergency] = useState<any>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [newEmergency, setNewEmergency] = useState<any>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map|null>(null);
  const socketRef = useRef<any>(null);

  // Auto-detect GPS & initialize map
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
            const data = await res.json();
            if (data.display_name) address = data.display_name.split(",").slice(0,3).join(",").trim();
          } catch {}
          setLiveLocation({ lat, lng, address });
          initMap(lat, lng);
        },
        () => {
          setLiveLocation({ lat: 15.8497, lng: 74.4977, address: "Belagavi (GPS denied)" });
          initMap(15.8497, 74.4977);
        },
        { enableHighAccuracy: true }
      );
    }
  }, []);

  const initMap = (lat: number, lng: number) => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([lat, lng], 13);
    mapInstance.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

    // Add current location marker
    const locIcon = L.divIcon({
      className: '',
      html: `<div style="width:20px;height:20px;border-radius:50%;background:#3B82F6;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
      iconSize: [20, 20], iconAnchor: [10, 10]
    });
    L.marker([lat, lng], { icon: locIcon }).addTo(map).bindPopup('<b>Ambulance Unit</b><br/>Current Location');
  };

  // Socket.IO for real-time notifications
  useEffect(() => {
    const token = localStorage.getItem('cc_token');
    const socketUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : 'http://localhost:3001';
    
    const socket = io(socketUrl);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Ambulance Dashboard connected to Socket.IO');
      if (token) {
        socket.emit('authenticate', { token, role: 'ambulance' });
        socket.emit('join-ambulance');
      }
    });

    socket.on('emergency-incident', (incident: any) => {
      console.log('🚨 New Emergency Alert:', incident);
      setNewEmergency(incident);
      setShowPopup(true);
      fetchData(); // Refresh lists
      
      // Add marker to map
      if (mapInstance.current && incident.location) {
        const alertIcon = L.divIcon({
          className: '',
          html: `<div style="width:24px;height:24px;border-radius:50%;background:#EF4444;border:3px solid #fff;box-shadow:0 0 15px rgba(239,68,68,0.8);animation:pulse 1s infinite">🚨</div>`,
          iconSize: [24, 24], iconAnchor: [12, 12]
        });
        L.marker([incident.location.lat, incident.location.lng], { icon: alertIcon })
          .addTo(mapInstance.current)
          .bindPopup(`<b>${incident.title}</b><br/>${incident.description}`)
          .openPopup();
          
        mapInstance.current.setView([incident.location.lat, incident.location.lng], 15);
      }
    });

    socket.on('incident-updated', (data: any) => {
      fetchData();
      if (activeEmergency && activeEmergency._id === data.incidentId) {
        setActiveEmergency((prev: any) => ({ ...prev, ...data }));
      }
    });

    return () => { socket.disconnect(); };
  }, [activeEmergency]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('cc_token');
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      
      const [emergenciesRes, statsRes] = await Promise.all([
        fetch(`${apiBase}/ambulance/emergencies`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiBase}/ambulance/stats`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      
      if (!emergenciesRes.ok || !statsRes.ok) throw new Error('API Error');
      
      const emergenciesData = await emergenciesRes.json();
      const statsData = await statsRes.json();
      setEmergencies(emergenciesData);
      setStats(statsData);
      
      // Auto-set active emergency if none selected and there's one in progress
      const inProgress = emergenciesData.find((e: any) => e.status === 'in_progress');
      if (inProgress && !activeEmergency) setActiveEmergency(inProgress);
    } catch (err) {
      console.error('Failed to fetch data', err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleAction = async (id: string, action: string) => {
    try {
      const endpoint = action === 'dispatch' ? 'dispatch' : action === 'arrive' ? 'arrive' : 'resolve';
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      
      const res = await fetch(`${apiBase}/incidents/${id}/${endpoint}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('cc_token')}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      
      if (action === 'resolve') {
        setActiveEmergency(null);
      } else {
        setActiveEmergency(data);
      }
      
      fetchData();
      
      if (socketRef.current) {
        if (action === 'dispatch') socketRef.current.emit('ambulance-dispatch', { incidentId: id });
        if (action === 'arrive') socketRef.current.emit('ambulance-arrived', { incidentId: id });
        if (action === 'resolve') socketRef.current.emit('incident-resolved', { incidentId: id });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getDirections = (incident: any) => {
    if (!liveLocation || !incident?.location) return;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${liveLocation.lat},${liveLocation.lng}&destination=${incident.location.lat},${incident.location.lng}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const acceptEmergency = () => {
    if (newEmergency) {
      handleAction(newEmergency._id, 'dispatch');
      setShowPopup(false);
      setNewEmergency(null);
      // Auto-open directions
      getDirections(newEmergency);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto pb-24 relative">
      <div className="px-5 pt-14 pb-4 bg-red-600 text-white shadow-md rounded-b-3xl z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[24px] font-black leading-tight">Ambulance Unit</h1>
            <p className="text-[12px] font-medium opacity-80 flex items-center gap-1 mt-1">
              <Radio size={12}/> Unit Online • Belagavi City
            </p>
          </div>
          <button onClick={() => setTab('home')} className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
            <Shield size={24} className="text-white" />
          </button>
        </div>
      </div>

      {/* Emergency Popup Alert */}
      {showPopup && newEmergency && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="bg-red-500 p-6 flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-red-600/30 animate-pulse"></div>
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-lg relative z-10">
                <AlertTriangle size={40} className="text-red-500" />
              </div>
              <h2 className="text-2xl font-black text-white mb-1 relative z-10">EMERGENCY ALERT</h2>
              <p className="text-red-100 font-bold uppercase tracking-wider text-sm relative z-10">{newEmergency.urgency || 'HIGH PRIORITY'}</p>
            </div>
            <div className="p-6">
              <h3 className="text-lg font-bold text-black mb-2">{newEmergency.title}</h3>
              <p className="text-sm text-gray-600 mb-4">{newEmergency.description}</p>
              
              <div className="bg-gray-50 rounded-xl p-3 flex items-start gap-3 mb-6 border border-gray-100">
                <MapPin size={18} className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-black">{newEmergency.location.area || newEmergency.location.address}</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button onClick={() => setShowPopup(false)} className="flex-1 py-3.5 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
                  Ignore
                </button>
                <button onClick={acceptEmergency} className="flex-[2] py-3.5 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200 transition-all active:scale-95 flex items-center justify-center gap-2">
                  <Navigation size={18} /> Accept & Go
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="px-5 mt-5">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-red-50 rounded-2xl p-4 border border-red-100 flex flex-col items-center justify-center text-center">
            <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-1">Active Alerts</p>
            <p className="text-3xl font-black text-red-600">{stats?.activeEmergencies || 0}</p>
          </div>
          <div className="bg-green-50 rounded-2xl p-4 border border-green-100 flex flex-col items-center justify-center text-center">
            <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-1">Resolved Today</p>
            <p className="text-3xl font-black text-green-700">{stats?.resolvedToday || 0}</p>
          </div>
        </div>

        {/* Map */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-black text-black">Live Tracking</h3>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span> GPS ACTIVE
            </span>
          </div>
          <div ref={mapRef} className="w-full h-48 rounded-3xl border border-gray-200 shadow-inner z-0 overflow-hidden" />
        </div>

        {/* Active Mission */}
        {activeEmergency && (
          <div className="bg-white border-2 border-red-500 rounded-3xl p-5 mb-6 shadow-xl shadow-red-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full -mr-10 -mt-10 blur-xl"></div>
            
            <div className="flex justify-between items-start mb-3 relative z-10">
              <div className="flex items-center gap-2">
                <span className="bg-red-500 text-white text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> Active Mission
                </span>
              </div>
              <span className="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg">{Math.floor((Date.now() - new Date(activeEmergency.createdAt).getTime()) / 60000)}m ago</span>
            </div>
            
            <h3 className="text-xl font-black text-black mb-2 relative z-10">{activeEmergency.title}</h3>
            <div className="flex items-start gap-3 mb-5 relative z-10 bg-gray-50 p-3 rounded-xl">
              <MapPin size={18} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-gray-700">{activeEmergency.location.area || activeEmergency.location.address}</p>
            </div>
            
            <div className="flex gap-2 relative z-10">
              <button onClick={() => getDirections(activeEmergency)} className="flex-1 py-3.5 bg-black text-white rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors">
                <Navigation size={16} /> Get Directions
              </button>
              
              {!activeEmergency.ambulanceArrived ? (
                <button onClick={() => handleAction(activeEmergency._id, 'arrive')} className="flex-1 py-3.5 bg-blue-500 text-white rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-blue-200 hover:bg-blue-600 transition-colors">
                  <MapPin size={16} /> Mark Arrived
                </button>
              ) : (
                <button onClick={() => handleAction(activeEmergency._id, 'resolve')} className="flex-1 py-3.5 bg-green-500 text-white rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-green-200 hover:bg-green-600 transition-colors">
                  <CheckCircle2 size={16} /> Mark Resolved
                </button>
              )}
            </div>
          </div>
        )}

        {/* Incoming Emergencies */}
        {!activeEmergency && (
          <div>
            <h3 className="font-black text-black mb-4 flex items-center gap-2">
              Incoming Alerts <span className="bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded-full">{emergencies.filter(e => e.status === 'open').length}</span>
            </h3>
            
            <div className="space-y-3">
              {loading && emergencies.length === 0 ? (
                <div className="flex justify-center p-8"><div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin"/></div>
              ) : emergencies.filter(e => e.status === 'open').length === 0 ? (
                <div className="bg-gray-50 border border-gray-100 rounded-3xl p-8 text-center">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <Shield size={28} className="text-gray-300" />
                  </div>
                  <p className="text-[15px] font-black text-gray-400">No active emergencies</p>
                  <p className="text-[12px] font-medium text-gray-400 mt-1">Standby for incoming alerts</p>
                </div>
              ) : (
                emergencies.filter(e => e.status === 'open').map(e => (
                  <div key={e._id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-black text-[14px] flex-1 pr-2 leading-tight">{e.title}</h4>
                      <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-lg shrink-0">{Math.floor((Date.now() - new Date(e.createdAt).getTime()) / 60000)}m ago</span>
                    </div>
                    <div className="flex items-start gap-2 mb-4">
                      <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
                      <p className="text-[12px] font-medium text-gray-500 line-clamp-1">{e.location.area || e.location.address}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => getDirections(e)} className="flex-1 py-2.5 bg-gray-100 text-black hover:bg-gray-200 rounded-xl font-bold text-[12px] transition-colors flex justify-center items-center gap-1.5">
                         <Navigation size={14}/> Map
                      </button>
                      <button onClick={() => handleAction(e._id, 'dispatch')} className="flex-[2] py-2.5 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white rounded-xl font-bold text-[12px] border border-red-200 hover:border-red-500 transition-colors flex justify-center items-center gap-1.5">
                         <AlertTriangle size={14}/> Accept
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
