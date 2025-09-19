const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Data storage
const DATA_FILE = path.join(__dirname, 'data', 'board-data.json');
const SESSIONS_FILE = path.join(__dirname, 'data', 'sessions.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// Initialize default board data
const defaultBoardData = {
  teams: [
    { id: 'dev', name: 'IT Devs', color: 'team-dev' },
    { id: 'design', name: 'R&G', color: 'team-design' },
    { id: 'qa', name: 'People Ops', color: 'team-qa' },
    { id: 'devops', name: 'Payments', color: 'team-devops' },
    { id: 'product', name: 'Mortgage', color: 'team-product' },
    { id: 'marketing', name: 'Other', color: 'team-marketing' }
  ],
  sprints: [
    { id: 1, name: 'Sprint 1' },
    { id: 2, name: 'Sprint 2' },
    { id: 3, name: 'Sprint 3' },
    { id: 4, name: 'Sprint 4' },
    { id: 5, name: 'Sprint 5' },
    { id: 6, name: 'Sprint 6' },
    { id: 7, name: 'Sprint 7' },
    { id: 8, name: 'Sprint 8' }
  ],
  features: [
    { id: 1, title: "User Authentication System", team: "dev", sprint: 1, assignee: "Sarah", description: "Implement secure login/logout functionality with session management, password hashing, and multi-factor authentication support." },
    { id: 2, title: "Database Performance Optimization", team: "dev", sprint: 1, assignee: "John", description: "Optimize database queries, add proper indexing, implement connection pooling, and reduce response times for high-traffic scenarios." },
    { id: 3, title: "Mobile App UI Redesign", team: "design", sprint: 2, assignee: "Mike", description: "Create modern, responsive mobile interface with improved navigation, accessibility features, and consistent design patterns." },
    { id: 4, title: "Payment Gateway Integration", team: "dev", sprint: 3, assignee: "Lisa", description: "Integrate multiple payment providers (Stripe, PayPal, etc.) with secure transaction processing, refund handling, and fraud detection." },
    { id: 5, title: "Automated Testing Suite", team: "qa", sprint: 3, assignee: "Tom", description: "Build comprehensive test automation framework covering unit tests, integration tests, and end-to-end testing scenarios." },
    { id: 6, title: "CI/CD Pipeline Setup", team: "devops", sprint: 2, assignee: "Alex", description: "Configure automated build, test, and deployment pipeline with staging environments and rollback capabilities." },
    { id: 7, title: "Employee Onboarding Portal", team: "product", sprint: 1, assignee: "Emma", description: "Develop self-service portal for new employee registration, document uploads, and workflow automation for HR processes." },
    { id: 8, title: "Customer Support Chat", team: "product", sprint: 4, assignee: "David", description: "Implement real-time chat system with agent routing, chat history, file sharing, and integration with support ticketing system." },
    { id: 9, title: "Load Testing & Performance", team: "qa", sprint: 4, assignee: "Amy", description: "Conduct comprehensive load testing to validate system performance under expected traffic volumes and identify bottlenecks." },
    { id: 10, title: "Security Vulnerability Assessment", team: "devops", sprint: 5, assignee: "Ryan", description: "Perform security audit including penetration testing, code review, and compliance validation for data protection standards." },
    { id: 11, title: "User Feedback Dashboard", team: "product", sprint: 3, assignee: "Emma", description: "Create analytics dashboard to collect, categorize, and visualize user feedback with sentiment analysis and reporting features." },
    { id: 12, title: "Data Analytics Platform", team: "dev", sprint: 6, assignee: "John", description: "Build real-time data processing and visualization platform with custom dashboards, data export, and business intelligence tools." }
  ],
  dependencies: [
    { from: 1, to: 4, relationship: 'prerequisite for', additionalInfo: 'Users must be authenticated before they can make payments' },
    { from: 2, to: 12, relationship: 'enables', additionalInfo: 'Optimized database is required for real-time analytics performance' },
    { from: 6, to: 5, relationship: 'enables', additionalInfo: 'CI/CD pipeline must be in place before automated testing can be effectively implemented' },
    { from: 4, to: 9, relationship: 'requires', additionalInfo: 'Payment system needs load testing to ensure it can handle transaction volumes' },
    { from: 10, to: 4, relationship: 'blocks', additionalInfo: 'Security assessment must complete before payment gateway goes live' }
  ],
  nextFeatureId: 13
};

// Session data structure
const defaultSessions = {
  sessions: {},
  activeCodes: []
};

// Load or create data files
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (error) {
    console.log('Error loading board data, using defaults:', error.message);
  }
  return defaultBoardData;
}

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      
      // Migrate existing sessions to new structure
      Object.values(sessions.sessions || {}).forEach(session => {
        // Add activeUsers if missing (convert from array if needed)
        if (!session.activeUsers) {
          session.activeUsers = new Set();
        } else if (Array.isArray(session.activeUsers)) {
          session.activeUsers = new Set(session.activeUsers);
        }
        
        // Migrate departments to teams if needed
        if (session.boardData && session.boardData.departments && !session.boardData.teams) {
          session.boardData.teams = session.boardData.departments.map(dept => ({
            ...dept,
            color: dept.color.replace('department-', 'team-')
          }));
          delete session.boardData.departments;
        }
        
        // Migrate feature dept to team if needed
        if (session.boardData && session.boardData.features) {
          session.boardData.features.forEach(feature => {
            if (feature.dept && !feature.team) {
              feature.team = feature.dept;
              delete feature.dept;
            }
          });
        }
        
        // Ensure dependencies have the new structure
        if (session.boardData && session.boardData.dependencies) {
          session.boardData.dependencies.forEach(dep => {
            if (!dep.relationship) {
              dep.relationship = 'depends on';
            }
            if (!dep.additionalInfo) {
              dep.additionalInfo = '';
            }
          });
        }
      });
      
      return sessions;
    }
  } catch (error) {
    console.log('Error loading sessions, using defaults:', error.message);
  }
  return defaultSessions;
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving board data:', error.message);
  }
}

function saveSessions(sessions) {
  try {
    // Create a copy for saving, converting Sets to arrays
    const sessionsToSave = JSON.parse(JSON.stringify(sessions, (key, value) => {
      if (key === 'activeUsers' && value instanceof Set) {
        return Array.from(value);
      }
      return value;
    }));
    
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsToSave, null, 2));
  } catch (error) {
    console.error('Error saving sessions:', error.message);
  }
}

let boardData = loadData();
let sessionData = loadSessions();

// Track all connected users globally
const globalActiveUsers = new Set();

// Generate access code
function generateAccessCode() {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  return code;
}

// Create new session
function createSession() {
  const code = generateAccessCode();
  const sessionId = uuidv4();
  
  sessionData.sessions[sessionId] = {
    code,
    created: new Date().toISOString(),
    users: [],
    activeUsers: new Set(),
    boardData: JSON.parse(JSON.stringify(boardData)) // Deep copy
  };
  
  sessionData.activeCodes.push(code);
  saveSessions(sessionData);
  
  return { sessionId, code };
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/create-session', (req, res) => {
  const session = createSession();
  res.json(session);
});

app.post('/api/join-session', (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: 'Access code required' });
  }
  
  // Find session by code
  const sessionEntry = Object.entries(sessionData.sessions).find(
    ([id, session]) => session.code === code.toUpperCase()
  );
  
  if (!sessionEntry) {
    return res.status(404).json({ error: 'Invalid access code' });
  }
  
  const [sessionId, session] = sessionEntry;
  res.json({ sessionId, boardData: session.boardData });
});

app.get('/api/board/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessionData.sessions[sessionId];
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json(session.boardData);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Add user to global active users immediately
  globalActiveUsers.add(socket.id);
  
  // Broadcast updated count to all users
  io.emit('global-participant-count', globalActiveUsers.size);
  
  socket.on('join-session', (sessionId) => {
    const session = sessionData.sessions[sessionId];
    if (session) {
      socket.join(sessionId);
      socket.sessionId = sessionId;
      
      // Initialize activeUsers Set if it doesn't exist (for existing sessions)
      if (!session.activeUsers) {
        session.activeUsers = new Set();
      }
      
      // Add user to active users set
      session.activeUsers.add(socket.id);
      
      console.log(`User ${socket.id} joined session ${sessionId}`);
      
      // Send current board state
      socket.emit('board-data', session.boardData);
      
      // Send current participant count to the joining user
      socket.emit('participant-count', session.activeUsers.size);
      socket.emit('global-participant-count', globalActiveUsers.size);
      
      // Notify others in the session about new user and updated count
      socket.to(sessionId).emit('user-joined', { userId: socket.id });
      socket.to(sessionId).emit('participant-count', session.activeUsers.size);
    } else {
      socket.emit('error', { message: 'Session not found' });
    }
  });
  
  // Handle feature updates
  socket.on('update-feature', (data) => {
    if (socket.sessionId) {
      const session = sessionData.sessions[socket.sessionId];
      if (session) {
        const featureIndex = session.boardData.features.findIndex(f => f.id === data.id);
        if (featureIndex !== -1) {
          session.boardData.features[featureIndex] = { ...session.boardData.features[featureIndex], ...data };
          saveSessions(sessionData);
          
          // Broadcast to all users in session
          io.to(socket.sessionId).emit('feature-updated', data);
        }
      }
    }
  });
  
  // Handle feature creation
  socket.on('create-feature', (data) => {
    if (socket.sessionId) {
      const session = sessionData.sessions[socket.sessionId];
      if (session) {
        const newFeature = {
          id: session.boardData.nextFeatureId++,
          ...data,
          description: data.description || ''
        };
        session.boardData.features.push(newFeature);
        saveSessions(sessionData);
        
        // Broadcast to all users in session
        io.to(socket.sessionId).emit('feature-created', newFeature);
      }
    }
  });
  
  // Handle feature movement
  socket.on('move-feature', (data) => {
    if (socket.sessionId) {
      const session = sessionData.sessions[socket.sessionId];
      if (session) {
        const featureIndex = session.boardData.features.findIndex(f => f.id === data.featureId);
        if (featureIndex !== -1) {
          session.boardData.features[featureIndex].team = data.team;
          session.boardData.features[featureIndex].sprint = data.sprint;
          saveSessions(sessionData);
          
          // Broadcast to all users in session
          io.to(socket.sessionId).emit('feature-moved', data);
        }
      }
    }
  });
  
  // Handle dependency updates
  socket.on('update-dependencies', (dependencies) => {
    if (socket.sessionId) {
      const session = sessionData.sessions[socket.sessionId];
      if (session) {
        session.boardData.dependencies = dependencies;
        saveSessions(sessionData);
        
        // Broadcast to all users in session
        socket.to(socket.sessionId).emit('dependencies-updated', dependencies);
      }
    }
  });
  
  // Handle team management
  socket.on('add-team', (team) => {
    if (socket.sessionId) {
      const session = sessionData.sessions[socket.sessionId];
      if (session) {
        session.boardData.teams.push(team);
        saveSessions(sessionData);
        
        // Broadcast to all users in session
        io.to(socket.sessionId).emit('team-added', team);
      }
    }
  });
  
  socket.on('remove-team', (teamId) => {
    if (socket.sessionId) {
      const session = sessionData.sessions[socket.sessionId];
      if (session) {
        session.boardData.teams = session.boardData.teams.filter(d => d.id !== teamId);
        // Also remove features in this team
        session.boardData.features = session.boardData.features.filter(f => f.team !== teamId);
        saveSessions(sessionData);
        
        // Broadcast to all users in session
        io.to(socket.sessionId).emit('team-removed', teamId);
      }
    }
  });
  
  // Handle sprint management
  socket.on('add-sprint', (sprint) => {
    if (socket.sessionId) {
      const session = sessionData.sessions[socket.sessionId];
      if (session) {
        session.boardData.sprints.push(sprint);
        saveSessions(sessionData);
        
        // Broadcast to all users in session
        io.to(socket.sessionId).emit('sprint-added', sprint);
      }
    }
  });
  
  socket.on('remove-sprint', (sprintId) => {
    if (socket.sessionId) {
      const session = sessionData.sessions[socket.sessionId];
      if (session) {
        session.boardData.sprints = session.boardData.sprints.filter(s => s.id !== sprintId);
        // Also remove features in this sprint
        session.boardData.features = session.boardData.features.filter(f => f.sprint !== sprintId);
        saveSessions(sessionData);
        
        // Broadcast to all users in session
        io.to(socket.sessionId).emit('sprint-removed', sprintId);
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove from global active users
    globalActiveUsers.delete(socket.id);
    
    // Broadcast updated global count to all users
    io.emit('global-participant-count', globalActiveUsers.size);
    
    if (socket.sessionId) {
      const session = sessionData.sessions[socket.sessionId];
      if (session) {
        // Initialize activeUsers Set if it doesn't exist (for existing sessions)
        if (!session.activeUsers) {
          session.activeUsers = new Set();
        }
        
        // Remove user from active users set
        session.activeUsers.delete(socket.id);
        
        // Notify remaining users about user leaving and updated count
        socket.to(socket.sessionId).emit('user-left', { userId: socket.id });
        socket.to(socket.sessionId).emit('participant-count', session.activeUsers.size);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});