import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown[];
};

export type JsonRpcResponse<T> = {
  jsonrpc: "2.0";
  id: string | number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export class JsonRpcError extends Error {
  public readonly code: number;
  public readonly data?: unknown;

  constructor(message: string, code: number, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }

  static fromResponse(response: JsonRpcResponse<unknown>): JsonRpcError {
    const { error } = response;
    return new JsonRpcError(
      error?.message ?? "JSON-RPC error",
      error?.code ?? -1,
      error?.data
    );
  }
}

export class JsonRpcClient {
  private readonly axios: AxiosInstance;
  readonly url: string;
  readonly label: string;
  private requestCounter = 0;

  constructor(url: string, label: string, timeoutMs: number) {
    this.url = url;
    this.label = label;
    this.axios = axios.create({
      baseURL: url,
      timeout: timeoutMs,
      headers: {
        "content-type": "application/json",
      },
      transitional: {
        clarifyTimeoutError: true,
      },
    });
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: this.nextId(),
      method,
      params,
    };

    const res = await this.send<JsonRpcResponse<T>>(payload);
    if (res.error) {
      throw JsonRpcError.fromResponse(res);
    }
    return res.result as T;
  }

  async batch<T>(
    requests: Array<{ method: string; params?: unknown[] }>
  ): Promise<JsonRpcResponse<T>[]> {
    const payloads: JsonRpcRequest[] = requests.map((req) => ({
      jsonrpc: "2.0",
      id: this.nextId(),
      method: req.method,
      params: req.params ?? [],
    }));

    const responses = await this.send<JsonRpcResponse<T>[]>(payloads);
    const map = new Map<string | number, JsonRpcResponse<T>>();
    for (const res of responses) {
      map.set(res.id, res);
    }
    return payloads.map((payload) => {
      const res = map.get(payload.id);
      if (!res) {
        throw new Error(
          `JSON-RPC batch response missing entry for request ${payload.id}`
        );
      }
      return res;
    });
  }

  private async send<T>(
    data: JsonRpcRequest | JsonRpcRequest[]
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      method: "POST",
      data,
    };

    const response = await this.axios.request<T>(config);
    return response.data;
  }

  private nextId(): string {
    this.requestCounter = (this.requestCounter + 1) % Number.MAX_SAFE_INTEGER;
    return `${Date.now()}-${this.requestCounter}`;
  }
}

