// ─── CivicConnect Backend Server ──────────────────────────────────────────────
// Express + MongoDB + Socket.IO for real-time ambulance dashboard notifications
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/civicconnect';
const JWT_SECRET = process.env.JWT_SECRET || 'civicconnect_secret_2026';

// ─── MongoDB Models ──────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['citizen', 'police', 'ambulance', 'admin', 'construction', 'emergency'], default: 'citizen' },
  phone:    { type: String, default: '' },
  avatar:   { type: String, default: '' },
  city:     { type: String, default: '' },
  location: {
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 },
  },
  isOnline:  { type: Boolean, default: false },
  lastSeen:  { type: Date, default: Date.now },
}, { timestamps: true });

const incidentSchema = new mongoose.Schema({
  type:        { type: String, required: true },  // accident, traffic_jam, pothole, road_damage, waterlogging, illegal_parking
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  location: {
    lat:     { type: Number, required: true },
    lng:     { type: Number, required: true },
    address: { type: String, default: '' },
    area:    { type: String, default: '' },
  },
  priority:    { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status:      { type: String, enum: ['open', 'pending', 'in_progress', 'resolved', 'closed'], default: 'open' },
  reportedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedTo:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Accident-specific
  injuries:        { type: Boolean, default: false },
  vehicleCount:    { type: Number, default: 1 },
  accidentSeverity:{ type: String, default: '' },
  roadBlocked:     { type: Boolean, default: false },
  // Ambulance response tracking
  ambulanceDispatched: { type: Boolean, default: false },
  ambulanceArrived:    { type: Boolean, default: false },
  ambulanceId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dispatchedAt:        { type: Date },
  arrivedAt:           { type: Date },
  resolvedAt:          { type: Date },
  // Evidence
  images:    [String],
  videos:    [String],
}, { timestamps: true });

const alertSchema = new mongoose.Schema({
  type:        { type: String, required: true },  // accident, traffic_jam, emergency, weather, police, ambulance
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  severity:    { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  location: {
    lat:  { type: Number, default: 0 },
    lng:  { type: Number, default: 0 },
    area: { type: String, default: '' },
  },
  active:    { type: Boolean, default: true },
  targetRole:{ type: String, default: 'all' }, // which role should see this
  incidentId:{ type: mongoose.Schema.Types.ObjectId, ref: 'Incident' },
  readBy:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

const complaintSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  category:    { type: String, default: 'general' },
  status:      { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  location: {
    lat: Number, lng: Number, address: String,
  },
}, { timestamps: true });

const locationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lat:    { type: Number, required: true },
  lng:    { type: Number, required: true },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Incident = mongoose.model('Incident', incidentSchema);
const Alert = mongoose.model('Alert', alertSchema);
const Complaint = mongoose.model('Complaint', complaintSchema);
const Location = mongoose.model('Location', locationSchema);

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.id;
      req.userRole = decoded.role;
    } catch {}
  }
  next();
}

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const connectedUsers = new Map(); // socketId -> { userId, role }

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Authenticate socket connection
  socket.on('authenticate', (data) => {
    const { token, role } = data;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      connectedUsers.set(socket.id, { userId: decoded.id, role: role || decoded.role });
      // Join role-specific rooms
      socket.join(`role:${role || decoded.role}`);
      socket.join(`user:${decoded.id}`);
      console.log(`[Socket] Authenticated: ${decoded.id} as ${role || decoded.role}`);
      socket.emit('authenticated', { success: true });
    } catch {
      socket.emit('authenticated', { success: false, error: 'Invalid token' });
    }
  });

  // Join ambulance room explicitly
  socket.on('join-ambulance', () => {
    socket.join('role:ambulance');
    console.log(`[Socket] ${socket.id} joined ambulance room`);
  });

  // Ambulance acknowledges incident
  socket.on('ambulance-dispatch', async (data) => {
    const { incidentId } = data;
    const user = connectedUsers.get(socket.id);
    if (!user) return;
    try {
      await Incident.findByIdAndUpdate(incidentId, {
        ambulanceDispatched: true,
        ambulanceId: user.userId,
        dispatchedAt: new Date(),
        status: 'in_progress',
      });
      // Notify all connected clients
      io.emit('incident-updated', { incidentId, status: 'in_progress', ambulanceDispatched: true });
      console.log(`[Socket] Ambulance dispatched to incident ${incidentId}`);
    } catch (err) {
      console.error('[Socket] Dispatch error:', err);
    }
  });

  // Ambulance arrives
  socket.on('ambulance-arrived', async (data) => {
    const { incidentId } = data;
    try {
      await Incident.findByIdAndUpdate(incidentId, {
        ambulanceArrived: true,
        arrivedAt: new Date(),
      });
      io.emit('incident-updated', { incidentId, ambulanceArrived: true });
    } catch (err) {
      console.error('[Socket] Arrival error:', err);
    }
  });

  // Incident resolved by ambulance
  socket.on('incident-resolved', async (data) => {
    const { incidentId } = data;
    try {
      await Incident.findByIdAndUpdate(incidentId, {
        status: 'resolved',
        resolvedAt: new Date(),
      });
      io.emit('incident-updated', { incidentId, status: 'resolved' });
    } catch (err) {
      console.error('[Socket] Resolve error:', err);
    }
  });

  // Location update from ambulance
  socket.on('location-update', (data) => {
    io.emit('ambulance-location', { socketId: socket.id, ...data });
  });

  socket.on('disconnect', () => {
    connectedUsers.delete(socket.id);
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role = 'citizen' } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, password required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed, role });
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({ token, _id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    // Update online status
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });

    res.json({ token, _id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── INCIDENT ROUTES ─────────────────────────────────────────────────────────

app.get('/api/incidents', optionalAuth, async (req, res) => {
  try {
    const { status, type, priority } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (priority) filter.priority = priority;

    const incidents = await Incident.find(filter)
      .sort({ createdAt: -1 })
      .populate('reportedBy', 'name email role')
      .populate('assignedTo', 'name email role')
      .populate('ambulanceId', 'name email');
    res.json(incidents);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/incidents/:id', optionalAuth, async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id)
      .populate('reportedBy', 'name email role')
      .populate('assignedTo', 'name email role')
      .populate('ambulanceId', 'name email');
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    res.json(incident);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/incidents', optionalAuth, async (req, res) => {
  try {
    const { type, title, description, location, priority, injuries, vehicleCount, accidentSeverity, roadBlocked } = req.body;
    if (!type || !title || !location?.lat || !location?.lng) {
      return res.status(400).json({ message: 'type, title, and location (lat/lng) are required' });
    }

    const incident = await Incident.create({
      type, title, description,
      location: { lat: location.lat, lng: location.lng, address: location.address || '', area: location.area || location.address || '' },
      priority: priority || 'medium',
      reportedBy: req.userId || null,
      injuries, vehicleCount, accidentSeverity, roadBlocked,
    });

    // ─── REAL-TIME: Emit to ambulance & emergency dashboards ─────────
    const incidentPayload = {
      _id: incident._id,
      type: incident.type,
      title: incident.title,
      description: incident.description,
      location: incident.location,
      priority: incident.priority,
      status: incident.status,
      injuries: incident.injuries,
      vehicleCount: incident.vehicleCount,
      accidentSeverity: incident.accidentSeverity,
      roadBlocked: incident.roadBlocked,
      createdAt: incident.createdAt,
    };

    // Emit to ALL connected clients (for ambulance dashboard auto pop-up)
    io.emit('new-incident', incidentPayload);

    // Also emit targeted notification to ambulance room
    if (type === 'accident' || priority === 'high' || injuries) {
      io.to('role:ambulance').emit('emergency-incident', {
        ...incidentPayload,
        urgency: injuries ? 'CRITICAL' : 'HIGH',
        message: `🚨 ${title} — ${injuries ? 'INJURIES REPORTED!' : 'Immediate response needed'}`,
      });
      io.to('role:emergency').emit('emergency-incident', {
        ...incidentPayload,
        urgency: injuries ? 'CRITICAL' : 'HIGH',
      });
    }

    // Auto-create alert for officers
    const alertData = {
      type: type === 'accident' ? 'emergency' : type,
      title: `📋 New ${type.replace(/_/g, ' ')} report`,
      description: `${title} — ${location.address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}`,
      severity: priority || 'medium',
      location: { lat: location.lat, lng: location.lng, area: location.address || '' },
      incidentId: incident._id,
      targetRole: type === 'accident' ? 'ambulance' : 'police',
    };
    const alert = await Alert.create(alertData);
    io.emit('new-alert', alert);

    console.log(`[Incident] Created: ${incident.title} (${incident.type}) — broadcasted to dashboards`);
    res.status(201).json(incident);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.patch('/api/incidents/:id', optionalAuth, async (req, res) => {
  try {
    const updates = req.body;
    if (updates.status === 'resolved') updates.resolvedAt = new Date();
    const incident = await Incident.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    // Broadcast update
    io.emit('incident-updated', { incidentId: incident._id, ...updates });

    res.json(incident);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.patch('/api/incidents/:id/dispatch', optionalAuth, async (req, res) => {
  try {
    const incident = await Incident.findByIdAndUpdate(req.params.id, {
      ambulanceDispatched: true,
      ambulanceId: req.userId || null,
      dispatchedAt: new Date(),
      status: 'in_progress',
    }, { new: true });
    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    io.emit('incident-updated', { incidentId: incident._id, status: 'in_progress', ambulanceDispatched: true });
    res.json(incident);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.patch('/api/incidents/:id/arrive', optionalAuth, async (req, res) => {
  try {
    const incident = await Incident.findByIdAndUpdate(req.params.id, {
      ambulanceArrived: true,
      arrivedAt: new Date(),
    }, { new: true });
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    io.emit('incident-updated', { incidentId: incident._id, ambulanceArrived: true });
    res.json(incident);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.patch('/api/incidents/:id/resolve', optionalAuth, async (req, res) => {
  try {
    const incident = await Incident.findByIdAndUpdate(req.params.id, {
      status: 'resolved',
      resolvedAt: new Date(),
    }, { new: true });
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    io.emit('incident-updated', { incidentId: incident._id, status: 'resolved' });
    res.json(incident);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── ALERT ROUTES ─────────────────────────────────────────────────────────────

app.get('/api/alerts', optionalAuth, async (req, res) => {
  try {
    const { active, targetRole } = req.query;
    const filter = {};
    if (active !== undefined) filter.active = active === 'true';
    if (targetRole) filter.targetRole = targetRole;
    const alerts = await Alert.find(filter).sort({ createdAt: -1 }).limit(50);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/alerts', optionalAuth, async (req, res) => {
  try {
    const alert = await Alert.create(req.body);
    io.emit('new-alert', alert);
    res.status(201).json(alert);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.patch('/api/alerts/:id', optionalAuth, async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!alert) return res.status(404).json({ message: 'Alert not found' });
    res.json(alert);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── COMPLAINT ROUTES ─────────────────────────────────────────────────────────

app.get('/api/complaints', optionalAuth, async (req, res) => {
  try {
    const complaints = await Complaint.find().sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/complaints', optionalAuth, async (req, res) => {
  try {
    const complaint = await Complaint.create({ ...req.body, userId: req.userId || null });
    res.status(201).json(complaint);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── LOCATION ROUTES ─────────────────────────────────────────────────────────

app.post('/api/locations', optionalAuth, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const loc = await Location.create({ userId: req.userId || null, lat, lng });
    // Update user location if authenticated
    if (req.userId) {
      await User.findByIdAndUpdate(req.userId, { 'location.lat': lat, 'location.lng': lng });
    }
    res.status(201).json(loc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────

app.get('/api/dashboard/stats', optionalAuth, async (req, res) => {
  try {
    const [openInc, resolvedInc, totalInc, activeAlerts, totalAlerts, totalUsers] = await Promise.all([
      Incident.countDocuments({ status: { $in: ['open', 'pending'] } }),
      Incident.countDocuments({ status: 'resolved' }),
      Incident.countDocuments(),
      Alert.countDocuments({ active: true }),
      Alert.countDocuments(),
      User.countDocuments(),
    ]);

    // Get recent incidents for ambulance dashboard
    const recentEmergencies = await Incident.find({
      type: { $in: ['accident'] },
      status: { $nin: ['resolved', 'closed'] },
    }).sort({ createdAt: -1 }).limit(10);

    res.json({
      incidents: { open: openInc, resolved: resolvedInc, total: totalInc },
      alerts: { active: activeAlerts, total: totalAlerts },
      users: { total: totalUsers },
      recentEmergencies,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── AMBULANCE-SPECIFIC ROUTES ────────────────────────────────────────────────

// Get all active emergencies for ambulance dashboard
app.get('/api/ambulance/emergencies', optionalAuth, async (req, res) => {
  try {
    const emergencies = await Incident.find({
      status: { $nin: ['resolved', 'closed'] },
    }).sort({ priority: -1, createdAt: -1 })
      .populate('reportedBy', 'name phone')
      .populate('ambulanceId', 'name');
    res.json(emergencies);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get ambulance dashboard stats
app.get('/api/ambulance/stats', optionalAuth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [activeEmergencies, dispatchedToday, resolvedToday, totalResolved, avgResponseTime] = await Promise.all([
      Incident.countDocuments({ status: { $nin: ['resolved', 'closed'] } }),
      Incident.countDocuments({ ambulanceDispatched: true, dispatchedAt: { $gte: today } }),
      Incident.countDocuments({ status: 'resolved', resolvedAt: { $gte: today } }),
      Incident.countDocuments({ status: 'resolved' }),
      // Calculate average response time for resolved incidents
      Incident.aggregate([
        { $match: { dispatchedAt: { $exists: true }, arrivedAt: { $exists: true } } },
        { $project: { responseTime: { $subtract: ['$arrivedAt', '$dispatchedAt'] } } },
        { $group: { _id: null, avg: { $avg: '$responseTime' } } },
      ]),
    ]);

    res.json({
      activeEmergencies,
      dispatchedToday,
      resolvedToday,
      totalResolved,
      avgResponseTimeMinutes: avgResponseTime[0] ? Math.round(avgResponseTime[0].avg / 60000) : 8,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    server: 'CivicConnect Backend',
    version: '1.0.0',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    socketConnections: io.engine?.clientsCount || 0,
    uptime: process.uptime(),
  });
});

// ─── SEED DEFAULT USERS ───────────────────────────────────────────────────────

async function seedDefaults() {
  const defaultUsers = [
    { name: 'Citizen User',    email: 'citizen@civic.com',    password: 'password123', role: 'citizen' },
    { name: 'Police Officer',  email: 'police@civic.com',     password: 'password123', role: 'police' },
    { name: 'Ambulance Team',  email: 'ambulance@civic.com',  password: 'password123', role: 'ambulance' },
    { name: 'Admin User',      email: 'admin@civic.com',      password: 'password123', role: 'admin' },
    { name: 'Construction',    email: 'construct@civic.com',   password: 'password123', role: 'construction' },
    { name: 'Emergency Unit',  email: 'emergency@civic.com',  password: 'password123', role: 'emergency' },
  ];

  for (const u of defaultUsers) {
    const exists = await User.findOne({ email: u.email });
    if (!exists) {
      const hashed = await bcrypt.hash(u.password, 10);
      await User.create({ ...u, password: hashed });
      console.log(`  ✓ Created default user: ${u.email} (${u.role})`);
    }
  }
}

// ─── START SERVER ─────────────────────────────────────────────────────────────

async function start() {
  try {
    console.log('\n🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected');

    console.log('\n👤 Seeding default users...');
    await seedDefaults();

    httpServer.listen(PORT, () => {
      console.log(`\n🚀 CivicConnect Backend running on http://localhost:${PORT}`);
      console.log(`📡 Socket.IO ready for real-time connections`);
      console.log(`\n📋 Default logins:`);
      console.log(`   citizen@civic.com    / password123`);
      console.log(`   ambulance@civic.com  / password123`);
      console.log(`   police@civic.com     / password123`);
      console.log(`   admin@civic.com      / password123`);
      console.log('');
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
