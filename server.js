require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

const raffleFile = path.join(__dirname, 'data', 'raffles.json');
const teamsFile = path.join(__dirname, 'data', 'teams.json');
const collabsFile = path.join(__dirname, 'data', 'collabs.json');
const websiteFolder = path.join(__dirname, 'whitelist-raffle-website');
const uploadFolder = path.join(websiteFolder, 'uploads');
if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder, { recursive: true });
const upload = multer({ dest: uploadFolder });

app.use(cors());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'raffle-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(websiteFolder, 'landing-page.html'));
});
app.use(express.static(websiteFolder));

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { return fallback; }
}
function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function loadRaffles() {
  return loadJson(raffleFile, { nextRaffleNumber: 1, raffles: {} });
}
function createId(prefix, number) {
  return prefix + '-' + String(number).padStart(4, '0');
}
function memberOf(team, userId) {
  if (!team || !userId) return false;
  if (team.ownerId === userId) return true;
  return (team.members || []).some(member => member.discordId === userId);
}
if (!fs.existsSync(teamsFile)) saveJson(teamsFile, { nextTeamNumber: 1, teams: {} });
if (!fs.existsSync(collabsFile)) saveJson(collabsFile, { nextCollabNumber: 1, collabs: {} });

function formatRaffle(raffle) {
  return {
    id: raffle.id,
    title: raffle.title,
    description: raffle.description,
    winners: raffle.winners,
    entries: (raffle.participants || []).length,
    status: raffle.status,
    endTime: raffle.endTime,
    ends: raffle.status === 'active' ? new Date(raffle.endTime).toLocaleString() : raffle.status,
    banner: raffle.banner || '',
    winnersSelected: [],
    winnerEmails: {}
  };
}

app.get('/api/raffles', (req, res) => {
  const data = loadRaffles();
  res.json(Object.values(data.raffles || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(formatRaffle));
});

app.get('/api/raffles/:id', (req, res) => {
  const raffle = loadRaffles().raffles[String(req.params.id || '').toUpperCase()];
  if (!raffle) return res.status(404).json({ error: 'Raffle not found' });
  res.json(formatRaffle(raffle));
});

app.post('/api/raffles/:id/enter', async (req, res) => {
  const raffleId = String(req.params.id || '').toUpperCase();
  const email = String(req.body.email || '').trim();
  const discordId = String((req.session.user && req.session.user.id) || req.body.discordId || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!/^\d{15,25}$/.test(discordId)) return res.status(400).json({ error: 'Login with Discord first.' });

  const data = loadRaffles();
  const raffle = data.raffles[raffleId];
  if (!raffle) return res.status(404).json({ error: 'Raffle not found.' });
  if (raffle.status !== 'active' || Date.now() >= raffle.endTime) return res.status(400).json({ error: 'This raffle is no longer accepting entries.' });
  if ((raffle.participants || []).includes(discordId)) return res.status(400).json({ error: 'You have already entered this raffle.' });

  const guildSettings = loadJson(path.join(__dirname, 'data', 'guilds.json'), { guilds: {} });
  const verifiedRoleId = guildSettings.guilds[raffle.guildId] && guildSettings.guilds[raffle.guildId].verifiedRoleId;
  if (verifiedRoleId) {
    const member = await fetch('https://discord.com/api/v10/guilds/' + raffle.guildId + '/members/' + discordId, {
      headers: { Authorization: 'Bot ' + process.env.DISCORD_TOKEN }
    }).then(r => r.json());
    if (!member.roles || !member.roles.includes(verifiedRoleId)) {
      return res.status(403).json({ error: 'You need the Verified role in that Discord server.' });
    }
  }

  raffle.participants = raffle.participants || [];
  const wallet = String(req.body.wallet || '').trim();
if (wallet && !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
  return res.status(400).json({ error: 'Enter a valid wallet address, or leave it blank.' });
}
raffle.participantWallets = raffle.participantWallets || {};
if (wallet && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
  return res.status(400).json({ error: 'Enter a valid Solana wallet address, or leave it blank.' });
}
  raffle.participants.push(discordId);
  raffle.participantEmails = raffle.participantEmails || {};
  raffle.participantEmails[discordId] = email;
  saveJson(raffleFile, data);
  res.json({ ok: true, message: 'You have entered the raffle.', entries: raffle.participants.length });
});

app.post('/api/raffles/create', upload.single('banner'), async (req, res) => {
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const winners = Number(req.body.winners);
  const channelId = String(req.body.channelId || '').trim();
  const hours = Number(req.body.hours);
  if (!title || !description || !channelId) return res.status(400).json({ error: 'Title, description, and channel are required.' });
  if (!Number.isInteger(winners) || winners < 1) return res.status(400).json({ error: 'Winners must be 1 or more.' });
  if (!Number.isFinite(hours) || hours <= 0) return res.status(400).json({ error: 'Hours must be greater than 0.' });

  const channel = await fetch('https://discord.com/api/v10/channels/' + channelId, {
    headers: { Authorization: 'Bot ' + process.env.DISCORD_TOKEN }
  }).then(r => r.json());
  if (!channel.guild_id) return res.status(400).json({ error: 'Bot cannot see that channel. Add the bot to the server first.' });

  const data = loadRaffles();
  const raffleId = createId('RAFFLE', data.nextRaffleNumber);
  data.nextRaffleNumber += 1;

  let bannerUrl = '';
  let bannerName = '';
  if (req.file) {
    const ext = path.extname(req.file.originalname || '') || '.png';
    bannerName = raffleId + ext;
    fs.renameSync(req.file.path, path.join(uploadFolder, bannerName));
    bannerUrl = '/uploads/' + bannerName;
  }

  const endTime = Date.now() + hours * 60 * 60 * 1000;
  const payload = {
    embeds: [{
      title: '🎟️ ' + title,
      description,
      fields: [
        { name: '🆔 Raffle ID', value: raffleId, inline: true },
        { name: '🏆 Winners', value: String(winners), inline: true },
        { name: '🎟️ Entries', value: '0', inline: true },
        { name: '⏰ Ends', value: '<t:' + Math.floor(endTime / 1000) + ':F>', inline: false }
      ],
      image: bannerName ? { url: 'attachment://' + bannerName } : undefined,
      footer: { text: 'Whitelist Raffle • Good luck!' }
    }],
    components: [{ type: 1, components: [{ type: 2, style: 3, label: 'ENTER RAFFLE', custom_id: 'raffle_enter_' + raffleId }] }]
  };

  let message;
  if (bannerName) {
    const form = new FormData();
    const bytes = fs.readFileSync(path.join(uploadFolder, bannerName));
    form.append('payload_json', JSON.stringify(payload));
    form.append('files[0]', new Blob([bytes]), bannerName);
    message = await fetch('https://discord.com/api/v10/channels/' + channelId + '/messages', {
      method: 'POST',
      headers: { Authorization: 'Bot ' + process.env.DISCORD_TOKEN },
      body: form
    }).then(r => r.json());
  } else {
    message = await fetch('https://discord.com/api/v10/channels/' + channelId + '/messages', {
      method: 'POST',
      headers: { Authorization: 'Bot ' + process.env.DISCORD_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => r.json());
  }
  if (!message.id) return res.status(400).json({ error: 'Could not post to that Discord channel.' });

  data.raffles[raffleId] = {
    id: raffleId, title, description, winners,
    duration: hours + 'h', endTime,
    guildId: channel.guild_id, channelId, messageId: message.id,
    creatorId: (req.session.user && req.session.user.id) || 'website',
    banner: bannerUrl, participants: [], winnersSelected: [],
    status: 'active', createdAt: Date.now()
  };
  saveJson(raffleFile, data);
  res.json({ ok: true, id: raffleId });
});

app.get('/api/teams', (req, res) => {
  const user = req.session.user;
  const teams = Object.values(loadJson(teamsFile, { teams: {} }).teams || {});
  if (!user) return res.json([]);
  res.json(teams.filter(team => memberOf(team, user.id)));
});

app.post('/api/teams', (req, res) => {
  const user = req.session.user;
  if (!user || !user.id) return res.status(401).json({ error: 'Login with Discord before creating a team.' });
  const name = String(req.body.name || '').trim();
  const project = String(req.body.project || '').trim();
  if (!name || !project) return res.status(400).json({ error: 'Team name and project are required.' });
  const data = loadJson(teamsFile, { nextTeamNumber: 1, teams: {} });
  const id = createId('TEAM', data.nextTeamNumber);
  data.nextTeamNumber += 1;
  data.teams[id] = {
    id, name, project,
    discord: String(req.body.discord || '').trim(),
    twitter: String(req.body.twitter || '').trim(),
    ownerId: user.id,
    members: [{ discordId: user.id, username: user.username, role: 'owner' }],
    createdAt: Date.now()
  };
  saveJson(teamsFile, data);
  res.json(data.teams[id]);
});

app.get('/api/collabs', (req, res) => {
  const user = req.session.user;
  const teams = loadJson(teamsFile, { teams: {} }).teams || {};
  const raffleData = loadRaffles();
  const mine = Object.values(loadJson(collabsFile, { collabs: {} }).collabs || {}).filter(collab => {
    if (!user) return false;
    return memberOf(teams[collab.fromTeamId], user.id) || memberOf(teams[collab.toTeamId], user.id);
  });
  res.json(mine.map(collab => {
    const raffle = collab.raffleId ? raffleData.raffles[collab.raffleId] : null;
    return {
      ...collab,
      raffleTitle: raffle ? raffle.title : collab.raffleTitle || '',
      raffleStatus: raffle ? raffle.status : null,
      winners: raffle && raffle.status === 'ended' ? (raffle.winnersSelected || []) : [],
      winnerEmails: raffle && raffle.status === 'ended' ? (raffle.participantEmails || {}) : {}
    };
  }));
});

app.post('/api/collabs', (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'Login with Discord first.' });
  const fromTeamId = String(req.body.fromTeamId || '').trim().toUpperCase();
  const toTeamId = String(req.body.toTeamId || '').trim().toUpperCase();
  const spots = Number(req.body.spots);
  const message = String(req.body.message || '').trim();
  const teams = loadJson(teamsFile, { teams: {} }).teams || {};
  if (!teams[fromTeamId] || !teams[toTeamId]) return res.status(400).json({ error: 'Both teams must exist.' });
  if (!memberOf(teams[fromTeamId], user.id)) return res.status(403).json({ error: 'You can only send a collab from your own team.' });
  if (fromTeamId === toTeamId) return res.status(400).json({ error: 'A team cannot collab with itself.' });
  if (!Number.isInteger(spots) || spots < 1) return res.status(400).json({ error: 'Spots must be 1 or more.' });
  const data = loadJson(collabsFile, { nextCollabNumber: 1, collabs: {} });
  const id = createId('COLLAB', data.nextCollabNumber);
  data.nextCollabNumber += 1;
  data.collabs[id] = { id, fromTeamId, toTeamId, fromTeamName: teams[fromTeamId].name, toTeamName: teams[toTeamId].name, spots, message, status: 'pending', createdAt: Date.now() };
  saveJson(collabsFile, data);
  res.json(data.collabs[id]);
});

app.post('/api/collabs/:id/respond', (req, res) => {
  const user = req.session.user;
  const data = loadJson(collabsFile, { collabs: {} });
  const collab = data.collabs[String(req.params.id || '').toUpperCase()];
  const teams = loadJson(teamsFile, { teams: {} }).teams || {};
  const action = String(req.body.action || '').toLowerCase();
  if (!collab) return res.status(404).json({ error: 'Collab not found.' });
  if (!user || !memberOf(teams[collab.toTeamId], user.id)) return res.status(403).json({ error: 'Only the receiving team can accept or decline.' });
  if (!['accepted', 'declined'].includes(action)) return res.status(400).json({ error: 'Action must be accepted or declined.' });
  collab.status = action;
  saveJson(collabsFile, data);
  res.json(collab);
});

app.post('/api/collabs/:id/raffle', (req, res) => {
  const user = req.session.user;
  const data = loadJson(collabsFile, { collabs: {} });
  const collab = data.collabs[String(req.params.id || '').toUpperCase()];
  const teams = loadJson(teamsFile, { teams: {} }).teams || {};
  const raffleId = String(req.body.raffleId || '').trim().toUpperCase();
  if (!collab) return res.status(404).json({ error: 'Collab not found.' });
  if (!user || !memberOf(teams[collab.fromTeamId], user.id)) return res.status(403).json({ error: 'Only the sending team can attach a raffle.' });
  if (collab.status !== 'accepted') return res.status(400).json({ error: 'Attach a raffle only after the collab is accepted.' });
  const raffle = loadRaffles().raffles[raffleId];
  if (!raffle) return res.status(404).json({ error: 'Raffle not found.' });
  collab.raffleId = raffleId;
  collab.raffleTitle = raffle.title;
  saveJson(collabsFile, data);
  res.json(collab);
});

app.get('/api/my-guilds', async (req, res) => {
  const token = req.session.user && req.session.user.accessToken;
  if (!token) return res.status(401).json({ error: 'Login with Discord first.' });
  const userGuilds = await fetch('https://discord.com/api/v10/users/@me/guilds', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
  const botGuilds = await fetch('https://discord.com/api/v10/users/@me/guilds', { headers: { Authorization: 'Bot ' + process.env.DISCORD_TOKEN } }).then(r => r.json());
  const botIds = new Set((botGuilds || []).map(g => g.id));
  res.json((userGuilds || []).filter(g => botIds.has(g.id)).map(g => ({ id: g.id, name: g.name })));
});

app.get('/api/guilds/:guildId/channels', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Login with Discord first.' });
  const channels = await fetch('https://discord.com/api/v10/guilds/' + req.params.guildId + '/channels', {
    headers: { Authorization: 'Bot ' + process.env.DISCORD_TOKEN }
  }).then(r => r.json());
  res.json((channels || []).filter(ch => ch.type === 0 || ch.type === 5).map(ch => ({ id: ch.id, name: ch.name })));
});

app.get('/auth/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri:'http://localhost:3000/auth/discord/callback',
    response_type: 'code',
    scope: 'identify guilds'
  });
  res.redirect('https://discord.com/api/oauth2/authorize?' + params.toString());
});

app.get('/auth/discord/callback', async (req, res) => {
  if (!req.query.code) return res.redirect('/');
  const body = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: String(req.query.code),
    redirect_uri:'http://localhost:3000/auth/discord/callback',
  });
  const tokenData = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  }).then(r => r.json());
  if (!tokenData.access_token) return res.send('Discord login failed.');
  const user = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: 'Bearer ' + tokenData.access_token }
  }).then(r => r.json());
  if (!user.id) return res.send('Could not read Discord user.');
  req.session.user = { id: user.id, username: user.username, accessToken: tokenData.access_token };
  req.session.save(() => res.redirect('/'));
});

app.get('/api/me', (req, res) => res.json(req.session.user || null));
app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

app.post('/api/teams/:id/invite', (req, res) => {
  const user = req.session.user;
  const teamId = String(req.params.id || '').toUpperCase();
  const discordId = String(req.body.discordId || '').trim();
  const username = String(req.body.username || 'member').trim();
  const data = loadJson(teamsFile, { teams: {} });
  const team = data.teams[teamId];

  if (!user) return res.status(401).json({ error: 'Login with Discord first.' });
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  if (team.ownerId !== user.id) return res.status(403).json({ error: 'Only the team owner can invite.' });
  if (!/^\d{15,25}$/.test(discordId)) return res.status(400).json({ error: 'Enter a valid Discord user ID.' });
  if ((team.members || []).some(member => member.discordId === discordId)) {
    return res.status(400).json({ error: 'That user is already on the team.' });
  }

  team.members = team.members || [];
  team.members.push({ discordId, username, role: 'member' });
  saveJson(teamsFile, data);
  res.json(team);
});

app.post('/api/teams/:id/invite-link', (req, res) => {
  const user = req.session.user;
  const data = loadJson(teamsFile, { teams: {} });
  const team = data.teams[String(req.params.id || '').toUpperCase()];
  if (!user) return res.status(401).json({ error: 'Login with Discord first.' });
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  if (team.ownerId !== user.id) return res.status(403).json({ error: 'Only the team owner can invite.' });

  const code = Math.random().toString(36).slice(2, 10);
  team.invites = team.invites || [];
  team.invites.push({ code, createdAt: Date.now() });
  saveJson(teamsFile, data);
  res.json({ link: '/join.html?code=' + code + '&team=' + team.id });
});

app.post('/api/join', (req, res) => {
  const user = req.session.user;
  const code = String(req.body.code || '').trim();
  const teamId = String(req.body.team || '').trim().toUpperCase();
  if (!user) return res.status(401).json({ error: 'Login with Discord first.' });

  const data = loadJson(teamsFile, { teams: {} });
  const team = data.teams[teamId];
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  if (!(team.invites || []).some(invite => invite.code === code)) {
    return res.status(400).json({ error: 'Invite link is not valid.' });
  }
  if ((team.members || []).some(member => member.discordId === user.id)) {
    return res.json({ ok: true, message: 'You are already on this team.' });
  }

  team.members = team.members || [];
  team.members.push({ discordId: user.id, username: user.username, role: 'member' });
  saveJson(teamsFile, data);
  res.json({ ok: true, message: 'You joined ' + team.name });
});

app.get('/api/teams/:id/dashboard', (req, res) => {
  const user = req.session.user;
  const team = loadJson(teamsFile, { teams: {} }).teams[String(req.params.id || '').toUpperCase()];
  if (!user) return res.status(401).json({ error: 'Login with Discord first.' });
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  if (!memberOf(team, user.id)) return res.status(403).json({ error: 'You are not on this team.' });

  const raffles = Object.values(loadRaffles().raffles || {});
  const collabs = Object.values(loadJson(collabsFile, { collabs: {} }).collabs || {});
  const mine = raffles.filter(raffle => raffle.creatorId === team.ownerId);
  const teamCollabs = collabs.filter(collab => collab.fromTeamId === team.id || collab.toTeamId === team.id);

  res.json({
    team,
    members: team.members || [],
    activeRaffles: mine.filter(raffle => raffle.status === 'active').length,
    endedRaffles: mine.filter(raffle => raffle.status === 'ended').length,
    entries: mine.reduce((sum, raffle) => sum + (raffle.participants || []).length, 0),
    collabs: teamCollabs.length
  });
});

app.listen(PORT, () => console.log('Website running on port ' + PORT));
