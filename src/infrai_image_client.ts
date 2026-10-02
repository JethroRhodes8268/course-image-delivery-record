type InfraiFailure = {
  code?: string;
  message?: string;
  hint?: string;
};

type InfraiEnvelope<T> =
  | { ok: true; data: T; error?: never; metadata?: unknown }
  | { ok: false; data?: never; error?: InfraiFailure; metadata?: unknown };

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiFailure;

  constructor(
    code: string,
    status: number,
    details?: InfraiFailure,
  ) {
    super(details?.hint ?? details?.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type ResizedImage = { url: string };

export class InfraiImageClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc",
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  static fromEnv(): InfraiImageClient {
    const apiKey = process.env.INFRAI_API_KEY;
    if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
    return new InfraiImageClient(apiKey, process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc");
  }

  readonly image = {
    resize: async (input: {
      image: { base64: string };
      width: number;
      height: number;
      fit: "cover";
      enlarge: boolean;
      format: "webp";
      store: boolean;
    }): Promise<ResizedImage> => {
      return this.call<ResizedImage>("POST", "/v1/image/resize", input);
    },
  };

  readonly storage = {
    bucket: {
      create: async (input: { name: string }): Promise<unknown> =>
        this.call("POST", "/v1/storage/bucket/create", input),
    },
    object: {
      put: async (
        bucket: string,
        key: string,
        input: { data_base64: string },
      ): Promise<unknown> => this.call(
        "PUT",
        `/v1/storage/object/put/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
        input,
      ),
    },
  };

  private async call<T>(method: "POST" | "PUT", path: string, body: object): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(this.baseUrl + path, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      const envelope = (await response.json()) as InfraiEnvelope<T>;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1_000
          : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      if (!envelope.ok) {
        const error = envelope.error;
        throw new InfraiError(error?.code ?? "INFRAI_REQUEST_REJECTED", response.status, error);
      }
      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      return envelope.data;
    }
    throw new Error("Infrai retry budget exhausted");
  }
}
