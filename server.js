// MOKU: მთავარი სერვერი
const express = require("express");
const path = require("path");
const homePage = require("./views/homePage");
const { dbStatus } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public"), { maxAge: "7d" }));

// დროებითი მთავარი გვერდი: ამოწმებს, რომ საიტი ინტერნეტში მუშაობს
app.get("/", async (req, res) => {
  res.send(homePage(await dbStatus()));
});

// Railway-სთვის და ჩვენთვის: სერვერი ცოცხალია თუ არა
app.get("/health", async (req, res) => {
  const db = await dbStatus();
  res.json({ ok: true, db: db.ok ? "connected" : db.reason, time: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).send("404");
});

app.listen(PORT, () => {
  console.log("MOKU მუშაობს პორტზე " + PORT);
});
