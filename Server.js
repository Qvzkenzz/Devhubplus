import express from "express";
import fetch from "node-fetch";
import session from "express-session";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "your_secret_here",
  resave: false,
  saveUninitialized: true
}));

const PORT = process.env.PORT || 3000;

// Roblox OAuth2
const CLIENT_ID = "1132230475596756197";
const CLIENT_SECRET = "RBX-ubsJm8cXsECTVlF9jqd1h1RVoFi7W9zhfri-Q1yhx39znpHx06WWkDIGorhXoLuE";
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/callback`;

// Roblox API & Universe
const ROBLOX_API_KEY = process.env.ROBLX_API_KEY;
const UNIVERSE_ID = process.env.UNIVERSE_ID;

// Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ------------- Helpers ---------------- //
async function getUserInfo(accessToken) {
  const res = await fetch("https://users.roblox.com/v1/users/authenticated", {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  return res.json();
}

async function saveScriptToDataStore(userId, scriptName, scriptCode) {
  const datastoreName = "DevHubScripts";
  const keyName = `${userId}_${scriptName}`;
  await fetch(
    `https://apis.roblox.com/datastores/v1/universes/${UNIVERSE_ID}/standard-datastores/${datastoreName}/entries/entry`,
    {
      method: "POST",
      headers: { "Content-Type":"application/json", "x-api-key": ROBLOX_API_KEY },
      body: JSON.stringify({ entryKey: keyName, value: scriptCode })
    }
  );
}

// Example Script Library
const scriptLibrary = [
  { name: "Basic Movement", code: `-- Basic Movement Script\nlocal player = game.Players.LocalPlayer\nplayer.Character.Humanoid.WalkSpeed = 16` },
  { name: "Simple Jump", code: `-- Jump Script\nlocal player = game.Players.LocalPlayer\nplayer.Character.Humanoid.JumpPower = 50` },
  { name: "GUI Example", code: `-- GUI Script\nlocal screenGui = Instance.new("ScreenGui")\nscreenGui.Parent = game.Players.LocalPlayer:WaitForChild("PlayerGui")` }
];

// ------------- Routes ---------------- //
app.get("/login", (req,res) => {
  const url = `https://apis.roblox.com/oauth/v1/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=openid profile`;
  res.redirect(url);
});

app.get("/callback", async (req,res) => {
  const code = req.query.code;
  if(!code) return res.send("No code received from Roblox.");
  const tokenResponse = await fetch("https://apis.roblox.com/oauth/v1/token", {
    method:"POST",
    headers: { "Content-Type":"application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:"authorization_code",
      code,
      redirect_uri: REDIRECT_URI
    })
  });
  const tokenData = await tokenResponse.json();
  req.session.access_token = tokenData.access_token;
  res.redirect("/dashboard");
});

app.get("/dashboard", async (req,res)=>{
  if(!req.session.access_token) return res.redirect("/login");
  const userData = await getUserInfo(req.session.access_token);

  res.send(`
<html>
<head>
<title>DevHub+ Dashboard</title>
<style>
body { margin:0; font-family:sans-serif; background: linear-gradient(to bottom right, #cce7ff, #e6f2ff); }
.side-menu { width:250px; position:fixed; height:100%; background:white; padding:20px; box-shadow:2px 0 5px rgba(0,0,0,0.1); }
.content { margin-left:270px; padding:20px; }
.card { background:white; padding:20px; margin-bottom:20px; border-radius:10px; box-shadow:0 2px 5px rgba(0,0,0,0.1); }
button { cursor:pointer; }
pre { background:#f0f0f0; padding:10px; border-radius:5px; overflow:auto; }
</style>
</head>
<body>
<div class="side-menu">
<h2>DevHub+</h2>
<ul>
<li><a href="/dashboard">Dashboard</a></li>
<li><a href="/library">Script Library</a></li>
<li><a href="/ai">AI Script Generator</a></li>
</ul>
</div>
<div class="content">
<div class="card">
<h2>Welcome, ${userData.name}</h2>
<img src="https://www.roblox.com/headshot-thumbnail/image?userId=${userData.id}&width=150&height=150&format=png" />
</div>
<div class="card">
<h3>Script Library</h3>
<ul>
${scriptLibrary.map((s,i)=>`<li>${s.name} <button onclick="copyScript(${i})">Get</button></li>`).join("")}
</ul>
<pre id="scriptOutput"></pre>
</div>
<div class="card">
<h3>AI Script Generator (Roblox Only)</h3>
<textarea id="aiPrompt" style="width:100%;height:100px;"></textarea><br>
<button onclick="generateAI()">Generate Script</button>
<pre id="aiOutput"></pre>
</div>
</div>
<script>
const scripts = ${JSON.stringify(scriptLibrary)};
function copyScript(index){
  const code = scripts[index].code;
  navigator.clipboard.writeText(code);
  document.getElementById("scriptOutput").innerText = code;
  alert("Script copied to clipboard!");
}
async function generateAI(){
  const prompt = document.getElementById("aiPrompt").value;
  const res = await fetch("/generate-script", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({prompt})
  });
  const data = await res.json();
  document.getElementById("aiOutput").innerText = data.script;
}
</script>
</body>
</html>
  `);
});

app.post("/generate-script", async (req,res)=>{
  const prompt = req.body.prompt;
  if(!prompt) return res.status(400).json({error:"Prompt required"});
  const fullPrompt = `You are a Roblox AI assistant. Only provide Roblox Lua scripts, explanations, or game help. User request: ${prompt}`;
  try{
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generate", {
      method:"POST",
      headers:{"Authorization":`Bearer ${GEMINI_API_KEY}`,"Content-Type":"application/json"},
      body: JSON.stringify({prompt:{text:fullPrompt},temperature:0.2,maxOutputTokens:512})
    });
    const data = await response.json();
    const aiReply = data.candidates[0].output;

    const userData = await getUserInfo(req.session.access_token);
    await saveScriptToDataStore(userData.id, `AI_${Date.now()}`, aiReply);

    res.json({script:aiReply});
  }catch(err){
    console.error(err);
    res.status(500).json({error:"AI request failed"});
  }
});

app.get("/library",(req,res)=>res.redirect("/dashboard"));
app.get("/ai",(req,res)=>res.redirect("/dashboard"));
app.get("/",(req,res)=>res.redirect("/login"));

app.listen(PORT,()=>console.log(`DevHub+ running on port ${PORT}`));
