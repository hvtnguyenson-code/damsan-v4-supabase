import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ARTIFACT_BUCKET = "knowledge-artifacts";
const DEFAULT_PASSWORD_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
const MAX_EARLY_PAGES = 15;
const MAX_LINES_PER_PAGE = 24;
const MAX_LINE_CHARS = 240;
const MAX_TOKEN_HITS = 120;
const MAX_BODY_SAMPLES = 20;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type PageRow = { page_number?: number; text?: string };
type JsonObject = Record<string, unknown>;

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, body: JsonObject) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object_invalid");
  return value as JsonObject;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function requireStaff(body: JsonObject) {
  const staffToken = cleanString(body.staff_token, 2048);
  const maGv = cleanString(body.ma_gv, 160);
  if (!staffToken || !maGv) throw new Error("staff_session_invalid");
  const tokenHash = await sha256Hex(staffToken);
  const { data: session, error: sessionError } = await admin
    .from("staff_sessions")
    .select("gv_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();
  if (sessionError || !session || !isUuid(session.gv_id)) throw new Error("staff_session_invalid");
  if (!session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) throw new Error("staff_session_invalid");
  const { data: teacher, error: teacherError } = await admin
    .from("giao_vien")
    .select("id,ma_gv,truong_id,quyen,mat_khau")
    .eq("id", session.gv_id)
    .maybeSingle();
  if (teacherError || !teacher || !isUuid(teacher.id) || !isUuid(teacher.truong_id)) throw new Error("staff_session_invalid");
  if (teacher.ma_gv !== maGv) throw new Error("staff_identity_mismatch");
  if (teacher.mat_khau === "123456" || teacher.mat_khau === DEFAULT_PASSWORD_HASH) throw new Error("staff_session_invalid");
  return { id: teacher.id, quyen: teacher.quyen };
}

async function ownedDocument(actor: { id: string; quyen: string }, documentId: string) {
  if (!isUuid(documentId)) throw new Error("document_invalid");
  const { data, error } = await admin
    .from("knowledge_documents")
    .select("id,owner_gv_id,title,original_filename,page_count,pipeline_status,extraction_manifest,book_index")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !data) throw new Error("document_unavailable");
  if (actor.quyen !== "Admin" && data.owner_gv_id !== actor.id) throw new Error("document_unavailable");
  if (!data.extraction_manifest?.artifact_path) throw new Error("extraction_artifact_missing");
  return data;
}

async function readArtifact(storagePath: string) {
  const { data, error } = await admin.storage.from(ARTIFACT_BUCKET).download(storagePath);
  if (error || !data) throw new Error("extraction_artifact_unavailable");
  const text = await data.text();
  if (!text || text.length > 8 * 1024 * 1024) throw new Error("extraction_artifact_invalid");
  let artifact: JsonObject;
  try {
    artifact = asObject(JSON.parse(text));
  } catch {
    throw new Error("extraction_artifact_invalid");
  }
  if (artifact.schema_version !== "DAMSAN_EXTRACT_V1" || artifact.boundary_mode !== "PDF_PAGE" || !Array.isArray(artifact.pages)) {
    throw new Error("extraction_artifact_invalid");
  }
  return artifact;
}

function foldOcr(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[|¦]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function boundedLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES_PER_PAGE)
    .map((line) => line.slice(0, MAX_LINE_CHARS));
}

function tokenHits(pageNumber: number, text: string) {
  const hits: Array<Record<string, unknown>> = [];
  const rawPatterns = [
    { mode: "STRICT_RAW", rx: /\bBài\s+(\d{1,3}|[IVXLCDM]{1,8})\b/giu },
    { mode: "SPACED_RAW", rx: /\bB\s*[àa]\s*i\s+(\d{1,3}|[IVXLCDM]{1,8})\b/giu },
  ];
  for (const pattern of rawPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.rx.exec(text)) !== null && hits.length < MAX_TOKEN_HITS) {
      hits.push({
        page_number: pageNumber,
        mode: pattern.mode,
        token: match[0].slice(0, 80),
        lesson_token: match[1],
        index: match.index,
        context: text.slice(Math.max(0, match.index - 100), Math.min(text.length, match.index + 220)).replace(/\s+/g, " ").slice(0, 360),
      });
    }
  }
  const folded = foldOcr(text);
  const foldedRx = /\bb\s*a\s*i\s+(\d{1,3}|[ivxlcdm]{1,8})\b/giu;
  let foldedMatch: RegExpExecArray | null;
  while ((foldedMatch = foldedRx.exec(folded)) !== null && hits.length < MAX_TOKEN_HITS) {
    hits.push({
      page_number: pageNumber,
      mode: "CURRENT_FOLDED",
      token: foldedMatch[0].slice(0, 80),
      lesson_token: foldedMatch[1],
      index: foldedMatch.index,
      context: folded.slice(Math.max(0, foldedMatch.index - 100), Math.min(folded.length, foldedMatch.index + 220)).slice(0, 360),
    });
  }
  return hits;
}

function pageDiagnostics(pages: PageRow[]) {
  const early = pages.slice(0, Math.min(MAX_EARLY_PAGES, pages.length)).map((page, index) => {
    const pageNumber = Number(page?.page_number || index + 1);
    const text = String(page?.text || "");
    const hits = tokenHits(pageNumber, text);
    return {
      page_number: pageNumber,
      text_chars: text.length,
      line_count: text ? text.split(/\r?\n/).length : 0,
      lines: boundedLines(text),
      lesson_hits: hits.slice(0, 30),
    };
  });

  const bodySamples: Array<Record<string, unknown>> = [];
  for (const page of pages) {
    if (bodySamples.length >= MAX_BODY_SAMPLES) break;
    const pageNumber = Number(page?.page_number || 0);
    if (!pageNumber || pageNumber <= MAX_EARLY_PAGES) continue;
    const text = String(page?.text || "");
    const hits = tokenHits(pageNumber, text).filter((hit) => hit.mode === "STRICT_RAW" || hit.mode === "CURRENT_FOLDED");
    if (!hits.length) continue;
    bodySamples.push({
      page_number: pageNumber,
      text_chars: text.length,
      first_lines: boundedLines(text).slice(0, 12),
      lesson_hits: hits.slice(0, 12),
    });
  }
  return { early_pages: early, body_samples: bodySamples };
}

async function diagnose(req: Request, body: JsonObject) {
  const actor = await requireStaff(body);
  const documentId = cleanString(body.document_id, 80);
  const doc = await ownedDocument(actor, documentId);
  const artifact = await readArtifact(cleanString(doc.extraction_manifest?.artifact_path, 1200));
  const pages = artifact.pages as PageRow[];
  const diagnostics = pageDiagnostics(pages);
  return json(req, 200, {
    status: "success",
    action: "diagnose_book_index",
    detector_version: "036B5A",
    read_only: true,
    document: {
      id: doc.id,
      title: doc.title,
      original_filename: doc.original_filename,
      page_count: doc.page_count,
      pipeline_status: doc.pipeline_status,
      current_book_index_detector: doc.book_index?.detector_version ?? null,
      current_book_index_segments: doc.book_index?.segment_count ?? 0,
    },
    artifact: {
      schema_version: artifact.schema_version,
      boundary_mode: artifact.boundary_mode,
      page_count: pages.length,
    },
    limits: {
      early_pages: MAX_EARLY_PAGES,
      lines_per_page: MAX_LINES_PER_PAGE,
      line_chars: MAX_LINE_CHARS,
      token_hits: MAX_TOKEN_HITS,
      body_samples: MAX_BODY_SAMPLES,
    },
    diagnostics,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { status: "error", code: "method_not_allowed", message: "Chỉ hỗ trợ POST." });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, 500, { status: "error", code: "server_not_configured", message: "Dịch vụ chẩn đoán chưa được cấu hình." });
  let body: JsonObject;
  try {
    body = asObject(await req.json());
  } catch {
    return json(req, 400, { status: "error", code: "body_invalid", message: "Dữ liệu yêu cầu không hợp lệ." });
  }
  const action = cleanString(body.action, 80).toLowerCase();
  try {
    if (action === "diagnose_book_index") return await diagnose(req, body);
    return json(req, 400, { status: "error", code: "action_invalid", message: "Thao tác không hợp lệ." });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected_error";
    const status = code === "staff_session_invalid" || code === "staff_identity_mismatch" ? 401 : code.includes("invalid") ? 400 : code.includes("unavailable") || code.includes("artifact") ? 409 : 500;
    if (status >= 500) console.error("knowledge-book-index-diagnostics error", error);
    return json(req, status, { status: "error", code, message: "Không thể chẩn đoán chỉ mục bài học từ tài liệu." });
  }
});
