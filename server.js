const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

require('dotenv').config();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-change-me';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if(!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Rate limiter
const rateLimit = require('express-rate-limit');
app.use(rateLimit({ windowMs: 15*60*1000, max: 200 }));

const upload = multer({ dest: UPLOAD_DIR });

// Optional MongoDB
let dbMode = 'json';
let models = null;
if(process.env.MONGO_URI){
  const mongoose = require('mongoose');
  mongoose.connect(process.env.MONGO_URI, { useNewUrlParser:true, useUnifiedTopology:true }).then(()=>{
    console.log('Connected to MongoDB');
  }).catch(e=>{ console.error('MongoDB connection failed', e); });
  models = require('./models');
  dbMode = 'mongo';
}


// Simple JSON DB helpers
const DB_PATH = path.join(__dirname, 'db.json');
function readDB(){
  try{return JSON.parse(fs.readFileSync(DB_PATH,'utf8'))}catch(e){return {users:[],postings:[],conversations:[]}}
}
function writeDB(db){ fs.writeFileSync(DB_PATH, JSON.stringify(db,null,2)); }

// Auth helpers
async function hashPassword(p){ return await bcrypt.hash(p, 10); }
async function comparePassword(p,h){ return await bcrypt.compare(p,h); }
function sign(user){ return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' }); }
function verifyToken(token){ try{return jwt.verify(token, JWT_SECRET)}catch(e){return null} }

// Helper: send verification using provider if configured
async function sendVerificationMedium({email, phone, code}){
  const sendReal = process.env.SEND_REAL_VERIFICATION === 'true';
  // Prefer SendGrid for email
  if(email && process.env.SENDGRID_API_KEY && sendReal){
    const sg = require('@sendgrid/mail'); sg.setApiKey(process.env.SENDGRID_API_KEY);
    await sg.send({ to: email, from: (process.env.SENDGRID_FROM||'no-reply@example.com'), subject: 'Find My Stuff verification code', text: `Your verification code: ${code}` });
    return { ok:true };
  }
  // Twilio for SMS
  if(phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM && sendReal){
    const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ body: `Your verification code: ${code}`, from: process.env.TWILIO_FROM, to: phone });
    return { ok:true };
  }
  // Fallback demo: not sending but allow response to contain code
  return { ok:true, demo:true };
}

// Register (returns verification code in response for demo)
app.post('/api/register', async (req,res)=>{
  const {name,email,password,phone} = req.body;
  if(!email||!password) return res.status(400).json({error:'email+password required'});
  if(dbMode==='mongo'){
    const existing = await models.User.findOne({ email }); if(existing) return res.status(400).json({ error: 'email exists' });
    const hashed = await hashPassword(password);
    const code = Math.floor(100000 + Math.random()*900000).toString();
    const user = await models.User.create({ name, email, password: hashed, verified: false, verificationCode: code });
    const sent = await sendVerificationMedium({ email, phone, code });
    // demo returns code if not sent
    return res.json({ ok:true, verificationCode: sent.demo? code : undefined });
  }

  const db = readDB();
  if(db.users.find(u=>u.email===email)) return res.status(400).json({error:'email exists'});
  const id = Date.now().toString(36);
  const hashed = await hashPassword(password);
  const code = Math.floor(100000 + Math.random()*900000).toString();
  const user = { id, name, email, password:hashed, verified:false, verificationCode:code };
  db.users.push(user); writeDB(db);
  const sent = await sendVerificationMedium({ email, phone, code });
  res.json({ok:true, verificationCode: sent.demo? code : undefined});
});

// Verify contact
app.post('/api/verify', async (req,res)=>{
  const {email,code} = req.body;
  if(dbMode==='mongo'){
    const u = await models.User.findOne({ email }); if(!u) return res.status(400).json({error:'not found'});
    if(u.verificationCode===code){ u.verified = true; u.verificationCode = null; await u.save(); return res.json({ok:true}); }
    return res.status(400).json({error:'invalid code'});
  }
  const db = readDB();
  const u = db.users.find(x=>x.email===email);
  if(!u) return res.status(400).json({error:'not found'});
  if(u.verificationCode===code){ u.verified = true; u.verificationCode = null; writeDB(db); return res.json({ok:true}); }
  return res.status(400).json({error:'invalid code'});
});

// Login
app.post('/api/login', async (req,res)=>{
  const {email,password} = req.body;
  if(dbMode==='mongo'){
    const u = await models.User.findOne({ email }); if(!u) return res.status(400).json({error:'invalid'});
    const ok = await comparePassword(password, u.password); if(!ok) return res.status(400).json({error:'invalid'});
    const token = sign({ id: u._id, email: u.email });
    return res.json({ token, user:{ id: u._id, name: u.name, email: u.email, verified: !!u.verified } });
  }
  const db = readDB();
  const u = db.users.find(x=>x.email===email);
  if(!u) return res.status(400).json({error:'invalid'});
  const ok = await comparePassword(password, u.password);
  if(!ok) return res.status(400).json({error:'invalid'});
  const token = sign(u);
  res.json({token, user:{id:u.id,name:u.name,email:u.email,verified:!!u.verified}});
});

// Postings
app.get('/api/postings', async (req,res)=>{
  if(dbMode==='mongo'){
    const list = await models.Posting.find().lean().sort({ created: -1 });
    return res.json(list);
  }
  const db = readDB();
  res.json(db.postings);
});

app.post('/api/postings', upload.single('attachment'), async (req,res)=>{
  const {type,item,desc,location,contactName,contactInfo} = req.body;
  // Set owner if authenticated
  let ownerId = null;
  const authHeader = req.headers['authorization'];
  if(authHeader && authHeader.startsWith('Bearer ')){
    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);
    if(payload) ownerId = payload.id;
  }
  if(dbMode==='mongo'){
    const doc = { ownerId: ownerId || undefined, type, item, desc, location, contactName, contactInfo };
    if(req.file){ doc.attachment = path.relative(__dirname, req.file.path).replace(/\\/g,'/'); }
    const p = await models.Posting.create(doc);
    return res.json(p);
  }

  const db = readDB();
  const id = Date.now().toString(36);
  const posting = { id, type, item, desc, location, contactName, contactInfo, ownerId, created: Date.now(), attachment: null };
  if(req.file){ posting.attachment = path.relative(__dirname, req.file.path).replace(/\\/g,'/'); }
  db.postings.push(posting); writeDB(db);
  res.json(posting);
});

// Create or get a private conversation for a posting (requires auth)
app.post('/api/conversations', async (req,res)=>{
  const auth = req.headers['authorization'];
  if(!auth || !auth.startsWith('Bearer ')) return res.status(401).json({error:'unauthenticated'});
  const token = auth.split(' ')[1]; const me = verifyToken(token);
  if(!me) return res.status(401).json({error:'invalid token'});

  const {postingId} = req.body;
  if(dbMode==='mongo'){
    const posting = await models.Posting.findById(postingId);
    if(!posting) return res.status(404).json({error:'posting not found'});
    if(!posting.ownerId) return res.status(400).json({error:'posting owner is not a registered user'});
    if(String(posting.ownerId) === String(me.id)) return res.status(400).json({error:'cannot open conversation with yourself'});
    let conv = await models.Conversation.findOne({ postingId: posting._id, participants: { $all: [posting.ownerId, me.id] } });
    if(conv) return res.json(conv);
    conv = await models.Conversation.create({ postingId: posting._id, posting: { id:posting._id, item:posting.item, contactName:posting.contactName, contactInfo:posting.contactInfo }, participants: [posting.ownerId, me.id], messages: [] });
    return res.json(conv);
  }

  const db = readDB();
  const posting = db.postings.find(p=>p.id===postingId);
  if(!posting) return res.status(404).json({error:'posting not found'});
  if(!posting.ownerId) return res.status(400).json({error:'posting owner is not a registered user'});
  if(posting.ownerId === me.id) return res.status(400).json({error:'cannot open conversation with yourself'});

  // find existing conversation between these two participants for the posting
  let conv = db.conversations.find(c=>c.postingId===postingId && c.participants && c.participants.includes(me.id) && c.participants.includes(posting.ownerId));
  if(conv) return res.json(conv);

  const id = Date.now().toString(36);
  conv = { id, postingId, posting: { id:posting.id, item:posting.item, contactName:posting.contactName, contactInfo:posting.contactInfo }, participants: [posting.ownerId, me.id], messages: [], created: Date.now() };
  db.conversations.push(conv); writeDB(db);
  res.json(conv);
});

// Get conversation by id (requires participant)
app.get('/api/conversations/byId/:convId', (req,res)=>{
  const auth = req.headers['authorization'];
  const token = auth && auth.startsWith('Bearer ') ? auth.split(' ')[1] : null;
  const me = token ? verifyToken(token) : null;
  const convId = req.params.convId;
  const db = readDB();
  const conv = db.conversations.find(c=>c.id===convId);
  if(!conv) return res.status(404).json({error:'not found'});
  // If conversation has participants, only allow participants
  if(conv.participants && conv.participants.length>0){ if(!me || !conv.participants.includes(me.id)) return res.status(403).json({error:'forbidden'}); }
  res.json(conv);
});

// List conversations for the authenticated user
app.get('/api/conversations/mine', (req,res)=>{
  const auth = req.headers['authorization'];
  if(!auth || !auth.startsWith('Bearer ')) return res.status(401).json({error:'unauthenticated'});
  const token = auth.split(' ')[1]; const me = verifyToken(token);
  if(!me) return res.status(401).json({error:'invalid token'});
  if(dbMode==='mongo'){
    return models.Conversation.find({ participants: me.id }).then(list=>res.json(list));
  }
  const db = readDB();
  const list = db.conversations.filter(c=>c.participants && c.participants.includes(me.id));
  res.json(list);
});

// List postings created by authenticated user
app.get('/api/postings/mine', (req,res)=>{
  const auth = req.headers['authorization'];
  if(!auth || !auth.startsWith('Bearer ')) return res.status(401).json({error:'unauthenticated'});
  const token = auth.split(' ')[1]; const me = verifyToken(token);
  if(!me) return res.status(401).json({error:'invalid token'});
  if(dbMode==='mongo'){
    return models.Posting.find({ ownerId: me.id }).then(list=>res.json(list));
  }
  const db = readDB();
  const list = db.postings.filter(p=>p.ownerId && p.ownerId === me.id);
  res.json(list);
});

// Delete a posting (only owner)
app.delete('/api/postings/:id', async (req,res)=>{
  const auth = req.headers['authorization'];
  if(!auth || !auth.startsWith('Bearer ')) return res.status(401).json({error:'unauthenticated'});
  const token = auth.split(' ')[1]; const me = verifyToken(token);
  if(!me) return res.status(401).json({error:'invalid token'});
  const id = req.params.id;
  if(dbMode==='mongo'){
    const p = await models.Posting.findById(id);
    if(!p) return res.status(404).json({error:'not found'});
    if(String(p.ownerId) !== String(me.id)) return res.status(403).json({error:'forbidden'});
    await models.Posting.deleteOne({ _id: id });
    // remove conversations related to posting
    await models.Conversation.deleteMany({ postingId: id });
    return res.json({ok:true});
  }
  const db = readDB();
  const idx = db.postings.findIndex(p=>p.id===id);
  if(idx===-1) return res.status(404).json({error:'not found'});
  const p = db.postings[idx];
  if(p.ownerId !== me.id) return res.status(403).json({error:'forbidden'});
  db.postings.splice(idx,1);
  // remove conversations for that posting
  db.conversations = db.conversations.filter(c=>c.postingId !== id);
  writeDB(db);
  res.json({ok:true});
});

// Socket.IO for real-time messaging
io.use((socket, next)=>{
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if(!token) return next();
  const payload = verifyToken(token);
  if(payload) socket.user = payload;
  next();
});

io.on('connection', socket=>{
  // Join a private conversation room by conversation id
  socket.on('join', (conversationId)=>{
    if(!conversationId) return;
    socket.join('conv_'+conversationId);
  });

  // Message inside a private conversation
  socket.on('message', data=>{
    // data: { conversationId, text }
    const db = readDB();
    const conv = db.conversations.find(c=>c.id===data.conversationId);
    if(!conv) return;
    // require that socket.user is part of conversation
    const uid = socket.user ? socket.user.id : null;
    if(!uid || !conv.participants || !conv.participants.includes(uid)) return;
    const msg = { id: Date.now().toString(36), fromUser: uid, name: data.name || socket.user.email || 'Anonymous', text: data.text, ts: Date.now() };
    conv.messages.push(msg); writeDB(db);
    io.to('conv_'+data.conversationId).emit('message', Object.assign({conversationId: data.conversationId}, msg));
  });
});

server.listen(PORT, ()=>console.log('Server running on http://localhost:'+PORT));
