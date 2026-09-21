import express from "express";
import cors from "cors";
import helmet from "helmet";

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

// Your routes here
// app.use("/api/...", ...);

app.get("/", (_req, res) => {
    res.json({
        success: true,
        message: "WhatsApp SaaS API is running"
    });
});

export default app;