import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { createProxyMiddleware } from "http-proxy-middleware";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const BACKEND_PORT = 8000;

// Try to spawn the Python backend
const spawnBackend = () => {
  console.log("Attempting to start Python backend...");
  
  const trySpawn = (cmd: string) => {
    const pythonProcess = spawn(cmd, ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", BACKEND_PORT.toString()], {
      stdio: "inherit",
      shell: true
    });

    pythonProcess.on("error", (err) => {
      console.error(`Failed to start backend with ${cmd}:`, err.message);
      if (cmd === "python3") {
        trySpawn("python");
      } else {
        console.error("Could not start Python backend. Please ensure Python and uvicorn are installed.");
      }
    });

    pythonProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Backend process exited with code ${code}`);
        // Optional: restart backend if it crashes
      }
    });
  };

  trySpawn("python3");
};

spawnBackend();

// Inject GEMINI_API_KEY into pdf-tools.html
app.get("/html/pdf-tools.html", (req, res) => {
  const filePath = path.join(__dirname, "frontend", "html", "pdf-tools.html");
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }
  let content = fs.readFileSync(filePath, "utf8");
  const apiKey = process.env.GEMINI_API_KEY || "";
  content = content.replace(
    "</head>",
    `<script>window.process = { env: { GEMINI_API_KEY: ${JSON.stringify(apiKey)} } };</script></head>`
  );
  res.send(content);
});

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, "frontend")));

// Proxy API requests to the Python backend
const proxyOptions = {
  target: `http://127.0.0.1:${BACKEND_PORT}`,
  changeOrigin: true,
  onError: (err: any, req: any, res: any) => {
    console.error("Proxy error:", err);
    res.status(502).send("Backend server is not reachable. Please wait or check logs.");
  }
};

app.use("/api", createProxyMiddleware(proxyOptions));
app.use("/detect-company", createProxyMiddleware(proxyOptions));
app.use("/redact", createProxyMiddleware(proxyOptions));
app.use("/ocr", createProxyMiddleware(proxyOptions));

// Fallback to index.html for SPA-like behavior
app.get("*", (req, res) => {
  // If it's an API-like request that wasn't caught, return 404
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not Found" });
  }
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
