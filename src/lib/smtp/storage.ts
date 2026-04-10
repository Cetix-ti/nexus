import { promises as fs } from "fs";
import path from "path";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: "tls" | "ssl" | "none";
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  subjectPrefix: string;
  ticketCreationEnabled: boolean;
  allowInvalidCerts: boolean;
  lastTestAt?: string;
  lastTestSuccess?: boolean;
  lastTestError?: string;
}

const FILE = path.join(process.cwd(), "data", "smtp-config.json");

const EMPTY: SmtpConfig = {
  host: "",
  port: 587,
  secure: "tls",
  username: "",
  password: "",
  fromEmail: "",
  fromName: "",
  replyTo: "",
  subjectPrefix: "",
  ticketCreationEnabled: false,
  allowInvalidCerts: false,
};

export async function loadSmtpConfig(): Promise<SmtpConfig> {
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    return { ...EMPTY, ...(JSON.parse(raw) as SmtpConfig) };
  } catch {
    return EMPTY;
  }
}

export async function saveSmtpConfig(cfg: SmtpConfig): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(cfg, null, 2), "utf-8");
}

export function isConfigured(cfg: SmtpConfig): boolean {
  // username is optional — many internal relays accept anonymous submission
  return !!(cfg.host && cfg.port && cfg.fromEmail);
}
