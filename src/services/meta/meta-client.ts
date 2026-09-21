// Minimal Meta Graph API client for WhatsApp Cloud API template sends.
// Endpoint shape follows the official WhatsApp Cloud API:
//   POST https://graph.facebook.com/{graphVersion}/{phoneNumberId}/messages
//   body: { messaging_product: "whatsapp", to, type: "template",
//           template: { name, language: { code }, components? } }
// No Meta secrets are logged here.

export class MetaApiError extends Error {
  status: number;
  metaCode?: number;
  metaBody?: unknown;

  constructor(message: string, status: number, metaBody?: unknown, metaCode?: number) {
    super(message);
    this.name = "MetaApiError";
    this.status = status;
    this.metaBody = metaBody;
    this.metaCode = metaCode;
  }
}

export interface TemplateComponent {
  type: "header" | "body" | "button";
  sub_type?: "quick_reply" | "url";
  index?: string;
  parameters?: Array<
    | { type: "text"; text: string }
    | { type: "image" | "video" | "document"; image?: { link?: string; id?: string }; video?: { link?: string; id?: string }; document?: { link?: string; id?: string } }
  >;
}

export interface SendTemplateParams {
  phoneNumberId: string;
  accessToken: string;
  graphVersion: string;
  to: string;
  templateName: string;
  language: string;
  components?: TemplateComponent[];
}

export type FetchFn = typeof fetch;

function sanitizeVersion(v: string): string {
  const cleaned = v.trim().replace(/^v/, "");
  if (!/^\d+\.\d+$/.test(cleaned)) throw new Error("Invalid META_GRAPH_VERSION");
  return `v${cleaned}`;
}

export interface SendTextParams {
  phoneNumberId: string;
  accessToken: string;
  graphVersion: string;
  to: string;
  body: string;
}

async function postMessagesApi(
  url: string,
  accessToken: string,
  body: unknown,
  fetchFn: FetchFn,
): Promise<string> {

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new MetaApiError(
      `Meta request failed: ${err instanceof Error ? err.message : "network error"}`,
      502,
    );
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const errObj =
      data && typeof data === "object" && "error" in data
        ? (data as { error?: { message?: string; code?: number } }).error
        : undefined;
    // Never include the access token in the error.
    throw new MetaApiError(
      errObj?.message ?? `Meta API error (HTTP ${res.status})`,
      res.status,
      data,
      errObj?.code,
    );
  }

  const id =
    data && typeof data === "object" && "messages" in data
      ? (data as { messages?: Array<{ id?: string }> }).messages?.[0]?.id
      : undefined;
  if (!id) throw new MetaApiError("Meta API returned no message id", 502, data);
  return id;
}

export async function sendTemplateMessage(
  params: SendTemplateParams,
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const version = sanitizeVersion(params.graphVersion);
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(params.phoneNumberId)}/messages`;

  return postMessagesApi(
    url,
    params.accessToken,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "template",
      template: {
        name: params.templateName,
        language: { code: params.language },
        ...(params.components ? { components: params.components } : {}),
      },
    },
    fetchFn,
  );
}

export interface FetchTemplatesParams {
  wabaId: string;
  accessToken: string;
  graphVersion: string;
}

export interface CreateTemplateParams {
  wabaId: string;
  accessToken: string;
  graphVersion: string;
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  components: Array<Record<string, unknown>>;
}

export async function createMessageTemplate(
  params: CreateTemplateParams,
  fetchFn: FetchFn = fetch,
): Promise<{ id: string; status: string }> {
  const version = sanitizeVersion(params.graphVersion);
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(params.wabaId)}/message_templates`;

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({
        name: params.name,
        language: params.language,
        // Creation enums are UPPERCASE (matches API reference + list responses).
        // Lowercase values are rejected with (#100) Invalid parameter.
        category: params.category.toUpperCase(),
        components: params.components.map((c) => ({
          ...c,
          type: typeof c.type === "string" ? (c.type as string).toUpperCase() : c.type,
          format: typeof c.format === "string" ? (c.format as string).toUpperCase() : c.format,
        })),
      }),
    });
  } catch (err) {
    throw new MetaApiError(
      `Meta request failed: ${err instanceof Error ? err.message : "network error"}`,
      502,
    );
  }

  let data: { id?: string; status?: string; error?: { message?: string; code?: number } };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new MetaApiError("Meta API returned invalid JSON", 502);
  }
  if (!res.ok) {
    throw new MetaApiError(
      data.error?.message ?? `Meta API error (HTTP ${res.status})`,
      res.status,
      data,
      data.error?.code,
    );
  }
  if (!data.id) throw new MetaApiError("Meta API returned no template id", 502, data);
  return { id: data.id, status: (data.status ?? "PENDING").toUpperCase() };
}

export interface UploadMediaParams {
  appId: string;
  accessToken: string;
  graphVersion: string;
  fileName: string;
  mimeType: string;
  data: Uint8Array;
}
/**
 * Meta Resumable Upload (single-shot, small files) — for TEMPLATE CREATION
 * samples only:
 *   1. POST /{v}/{appId}/uploads {file_name, file_length, file_type} -> {id: session}
 *   2. POST /{v}/{session} with raw bytes + file_offset:0 -> {h: handle}
 * The "h" handle is valid ONLY as example.header_handle at creation time.
 * It is NOT a valid send-time media id (use uploadSendMedia for sends).
 */
export async function uploadMediaToMeta(
  params: UploadMediaParams,
  fetchFn: FetchFn = fetch,
): Promise<{ handle: string }> {
  const version = sanitizeVersion(params.graphVersion);
  const auth = { Authorization: `Bearer ${params.accessToken}` };

  let sessionRes: Response;
  try {
    sessionRes = await fetchFn(
      `https://graph.facebook.com/${version}/${encodeURIComponent(params.appId)}/uploads`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: params.fileName,
          file_length: params.data.byteLength,
          file_type: params.mimeType,
        }),
      },
    );
  } catch (err) {
    throw new MetaApiError(
      `Meta upload session failed: ${err instanceof Error ? err.message : "network error"}`,
      502,
    );
  }
  let session: { id?: string; error?: { message?: string; code?: number } };
  try {
    session = (await sessionRes.json()) as typeof session;
  } catch {
    throw new MetaApiError("Meta API returned invalid JSON", 502);
  }
  if (!sessionRes.ok || !session.id) {
    throw new MetaApiError(
      session.error?.message ?? `Meta upload session failed (HTTP ${sessionRes.status})`,
      sessionRes.status,
      session,
      session.error?.code,
    );
  }

  let uploadRes: Response;
  try {
    // NOTE: session.id is a complete path token (e.g. "upload:MTph...?sig=...").
    // It must NOT be URL-encoded — encoding breaks Meta's object lookup.
    uploadRes = await fetchFn(
      `https://graph.facebook.com/${version}/${session.id}`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": params.mimeType, file_offset: "0" },
        body: Buffer.from(params.data),
      },
    );
  } catch (err) {
    throw new MetaApiError(
      `Meta upload failed: ${err instanceof Error ? err.message : "network error"}`,
      502,
    );
  }
  let uploaded: { h?: string; error?: { message?: string; code?: number } };
  try {
    uploaded = (await uploadRes.json()) as typeof uploaded;
  } catch {
    throw new MetaApiError("Meta API returned invalid JSON", 502);
  }
  if (!uploadRes.ok || !uploaded.h) {
    throw new MetaApiError(
      uploaded.error?.message ?? `Meta upload failed (HTTP ${uploadRes.status})`,
      uploadRes.status,
      uploaded,
      uploaded.error?.code,
    );
  }
  return { handle: uploaded.h };
}

export interface SendMediaParams {
  phoneNumberId: string;
  accessToken: string;
  graphVersion: string;
  fileName: string;
  mimeType: string;
  data: Uint8Array;
}

/**
 * Phone-number media upload — for SEND-TIME header media:
 *   POST /{v}/{phoneNumberId}/media (multipart: file + messaging_product)
 *   -> {id: numeric media id}
 * Use this id as image/video/document id in template send payloads.
 */
export async function uploadSendMedia(
  params: SendMediaParams,
  fetchFn: FetchFn = fetch,
): Promise<{ id: string }> {
  const version = sanitizeVersion(params.graphVersion);
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append(
    "file",
    new Blob([params.data], { type: params.mimeType }),
    params.fileName,
  );

  let res: Response;
  try {
    res = await fetchFn(
      `https://graph.facebook.com/${version}/${encodeURIComponent(params.phoneNumberId)}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${params.accessToken}` },
        body: form,
      },
    );
  } catch (err) {
    throw new MetaApiError(
      `Meta media upload failed: ${err instanceof Error ? err.message : "network error"}`,
      502,
    );
  }
  let data: { id?: string; error?: { message?: string; code?: number } };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new MetaApiError("Meta API returned invalid JSON", 502);
  }
  if (!res.ok || !data.id) {
    throw new MetaApiError(
      data.error?.message ?? `Meta media upload failed (HTTP ${res.status})`,
      res.status,
      data,
      data.error?.code,
    );
  }
  return { id: data.id };
}

export async function fetchMessageTemplates(
  params: FetchTemplatesParams,
  fetchFn: FetchFn = fetch,
): Promise<unknown[]> {
  const version = sanitizeVersion(params.graphVersion);
  let url =
    `https://graph.facebook.com/${version}/${encodeURIComponent(params.wabaId)}` +
    `/message_templates?fields=name,language,status,category,components&limit=100`;

  const all: unknown[] = [];
  for (let page = 0; page < 5 && url; page += 1) {
    let res: Response;
    try {
      res = await fetchFn(url, {
        headers: { Authorization: `Bearer ${params.accessToken}` },
      });
    } catch (err) {
      throw new MetaApiError(
        `Meta request failed: ${err instanceof Error ? err.message : "network error"}`,
        502,
      );
    }
    let data: { data?: unknown[]; paging?: { next?: string }; error?: { message?: string; code?: number } };
    try {
      data = (await res.json()) as typeof data;
    } catch {
      throw new MetaApiError("Meta API returned invalid JSON", 502);
    }
    if (!res.ok) {
      throw new MetaApiError(
        data.error?.message ?? `Meta API error (HTTP ${res.status})`,
        res.status,
        data,
        data.error?.code,
      );
    }
    if (Array.isArray(data.data)) all.push(...data.data);
    url = data.paging?.next ?? "";
  }
  return all;
}

export async function sendTextMessage(
  params: SendTextParams,
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const version = sanitizeVersion(params.graphVersion);
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(params.phoneNumberId)}/messages`;

  return postMessagesApi(
    url,
    params.accessToken,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "text",
      text: { body: params.body, preview_url: false },
    },
    fetchFn,
  );
}

export interface SendChatMediaParams {
  phoneNumberId: string;
  accessToken: string;
  graphVersion: string;
  to: string;
  kind: "image" | "video" | "document";
  link?: string;
  id?: string;
  caption?: string;
  filename?: string;
}

export async function sendMediaMessage(
  params: SendChatMediaParams,
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const version = sanitizeVersion(params.graphVersion);
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(params.phoneNumberId)}/messages`;

  const media: Record<string, unknown> = params.id ? { id: params.id } : { link: params.link };
  if (params.caption) media.caption = params.caption;
  if (params.kind === "document" && params.filename) media.filename = params.filename;

  return postMessagesApi(
    url,
    params.accessToken,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: params.kind,
      [params.kind]: media,
    },
    fetchFn,
  );
}
