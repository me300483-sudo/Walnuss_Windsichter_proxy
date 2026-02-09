import express from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import { google } from "googleapis";

const app = express();
const upload = multer();

const JWT_SECRET = process.env.JWT_SECRET;
const ROBOFLOW_KEY = process.env.ROBOFLOW_KEY;
const DRIVE_FOLDER = process.env.DRIVE_FOLDER;
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

function sanitize(text) {
  return text
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/[^A-Za-z0-9_\- ]/g, "")
    .replace(/ /g, "_")
    .replace(/_+/g, "_");
}

// TOKEN ENDPOINT
app.get("/token", (req, res) => {
  const token = jwt.sign({ ts: Date.now() }, JWT_SECRET, { expiresIn: "5m" });
  res.json({ token });
});

// UPLOAD ENDPOINT
app.post("/upload", upload.single("photo"), async (req, res) => {
  try {
    jwt.verify(req.body.token, JWT_SECRET);

    const version = req.body.version;
    const sieve = req.body.sievefraction;
    const cls = req.body.class;
    const comment = sanitize(req.body.comment);
    const timestamp = new Date().toISOString().replace(/[:]/g, "-");

    const filename = `${version}_${sieve}_${cls}_${comment}_${timestamp}.jpg`;

    // GOOGLE DRIVE AUTH
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ["https://www.googleapis.com/auth/drive"]
    });

    const drive = google.drive({ version: "v3", auth });

    // GOOGLE DRIVE UPLOAD
    await drive.files.create({
      requestBody: {
        name: filename,
        parents: [DRIVE_FOLDER]
      },
      media: {
        mimeType: "image/jpeg",
        body: Buffer.from(req.file.buffer)
      }
    });

    // ROBOFLOW UPLOAD
    await fetch("https://api.roboflow.com/windsichterwalnusskernschale/windsichterwalnusskernschale/5/upload", {
      method: "POST",
      body: req.file.buffer,
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Roboflow-Tag": `${sieve},${version}`,
        "X-Roboflow-Class": cls,
        "X-Roboflow-Filename": filename,
        "Authorization": `Bearer ${ROBOFLOW_KEY}`
      }
    });

    res.send("OK");
  } catch (e) {
    res.status(401).send("Unauthorized");
  }
});

app.listen(8080);
